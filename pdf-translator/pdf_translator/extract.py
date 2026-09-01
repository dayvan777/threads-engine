"""Extract translatable text segments from a PDF page, keeping layout info.

A *segment* is a group of consecutive lines inside one text block that share
the same visual style (font size / boldness). Each segment remembers its
bounding box, dominant style and alignment so it can be re-typeset in place
after translation.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass, field

import pymupdf

log = logging.getLogger(__name__)

# span "flags" bits (see PyMuPDF docs)
_FLAG_SUPERSCRIPT = 1
_FLAG_ITALIC = 2
_FLAG_SERIF = 4
_FLAG_MONO = 8
_FLAG_BOLD = 16

_HAS_LETTER = re.compile(r"[^\W\d_]", re.UNICODE)


@dataclass
class Segment:
    rect: pymupdf.Rect
    text: str
    size: float
    color: str
    bold: bool
    italic: bool
    family: str            # sans | serif | mono
    align: str             # left | center | right | justify
    line_height: float
    lines: int = 1
    rotate: int = 0
    insert_rect: pymupdf.Rect | None = None  # possibly widened box, see core
    translation: str | None = None
    scale: float = 1.0     # fill factor reported by insert_htmlbox

    @property
    def translatable(self) -> bool:
        """Numbers, page markers etc. are left untouched in the original."""
        return bool(_HAS_LETTER.search(self.text))


@dataclass
class _Line:
    bbox: pymupdf.Rect
    text: str
    dir: tuple[float, float]
    sizes: Counter = field(default_factory=Counter)
    colors: Counter = field(default_factory=Counter)
    fonts: Counter = field(default_factory=Counter)
    bold_chars: int = 0
    italic_chars: int = 0
    serif_chars: int = 0
    mono_chars: int = 0
    chars: int = 0


def _finish_fragment(spans: list[dict], direction: tuple[float, float]) -> _Line | None:
    bbox: pymupdf.Rect | None = None
    line = _Line(bbox=pymupdf.Rect(0, 0, 0, 0), text="", dir=direction)
    parts: list[str] = []
    for span in spans:
        text = span.get("text", "")
        if not text:
            continue
        parts.append(text)
        bbox = pymupdf.Rect(span["bbox"]) if bbox is None else bbox | span["bbox"]
        n = len(text.strip()) or len(text)
        line.chars += n
        flags = span.get("flags", 0)
        if not flags & _FLAG_SUPERSCRIPT:
            line.sizes[round(span.get("size", 11.0), 1)] += n
        line.colors[span.get("color", 0)] += n
        line.fonts[span.get("font", "")] += n
        if flags & _FLAG_BOLD:
            line.bold_chars += n
        if flags & _FLAG_ITALIC:
            line.italic_chars += n
        if flags & _FLAG_SERIF:
            line.serif_chars += n
        if flags & _FLAG_MONO:
            line.mono_chars += n
    line.text = re.sub(r"\s+", " ", "".join(parts)).strip()
    if not line.text or bbox is None:
        return None
    line.bbox = bbox
    if not line.sizes:  # all-superscript fragment
        for span in spans:
            line.sizes[round(span.get("size", 11.0), 1)] += 1
    return line


def _gap_threshold(size: float) -> float:
    """Horizontal gaps beyond this belong to different layout cells.

    Must tolerate the stretched word spacing of justified lines (< ~2 em)
    while still splitting table cells and label/value pairs, whose gaps are
    normally much wider.
    """
    return max(6.0, 2.2 * size)


def _line_fragments(raw: dict) -> list[_Line]:
    """Split one raw line into fragments at large horizontal gaps.

    Text on the same baseline separated by a wide gap (table cells, columns,
    label/value pairs) belongs to different layout cells and must be
    translated and re-typeset independently.
    """
    direction = tuple(raw.get("dir", (1, 0)))
    fragments: list[_Line] = []
    current: list[dict] = []
    for span in raw.get("spans", []):
        if not span.get("text"):
            continue
        if current:
            prev = current[-1]
            gap = span["bbox"][0] - prev["bbox"][2]
            if gap > _gap_threshold(prev.get("size", 11.0)):
                if (frag := _finish_fragment(current, direction)):
                    fragments.append(frag)
                current = []
        current.append(span)
    if current and (frag := _finish_fragment(current, direction)):
        fragments.append(frag)
    return fragments


def _absorb(row: _Line, frag: _Line, after: bool) -> None:
    row.text = f"{row.text} {frag.text}" if after else f"{frag.text} {row.text}"
    row.bbox |= frag.bbox
    row.sizes.update(frag.sizes)
    row.colors.update(frag.colors)
    row.fonts.update(frag.fonts)
    row.bold_chars += frag.bold_chars
    row.italic_chars += frag.italic_chars
    row.serif_chars += frag.serif_chars
    row.mono_chars += frag.mono_chars
    row.chars += frag.chars


def _merge_same_baseline(fragments: list[_Line]) -> list[_Line]:
    """Re-join fragments MuPDF over-split on one baseline.

    Heavily stretched justified lines come back from get_text() as several
    one-word "lines" on the same baseline; treating each as a segment would
    break the paragraph. Anything closer than the cell-gap threshold is one
    logical line.
    """
    rows: list[_Line] = []
    for frag in fragments:
        merged = False
        if _rotation(frag.dir) == 0:
            size = float(_dominant(frag.sizes, 11.0))
            threshold = _gap_threshold(size)
            for row in rows:
                if row.dir != frag.dir:
                    continue
                row_mid = (row.bbox.y0 + row.bbox.y1) / 2
                frag_mid = (frag.bbox.y0 + frag.bbox.y1) / 2
                if abs(row_mid - frag_mid) > 0.5 * size:
                    continue
                gap_after = frag.bbox.x0 - row.bbox.x1
                gap_before = row.bbox.x0 - frag.bbox.x1
                if -2 <= gap_after <= threshold:
                    _absorb(row, frag, after=True)
                    merged = True
                    break
                if -2 <= gap_before <= threshold:
                    _absorb(row, frag, after=False)
                    merged = True
                    break
        if not merged:
            rows.append(frag)
    return rows


def _sizes_close(a: float, b: float) -> bool:
    return abs(a - b) <= max(0.6, 0.12 * max(a, b))


def _join_lines(lines: list[_Line]) -> str:
    """Join line texts into one paragraph, resolving hyphenation."""
    out = ""
    for line in lines:
        text = line.text
        if not out:
            out = text
            continue
        if out.endswith("­"):
            out = out[:-1] + text
        elif out.endswith("-") and text[:1].islower():
            # German end-of-line hyphenation: "Bundes-" + "regierung"
            out = out[:-1] + text
        else:
            out += " " + text
    return out


def _dominant(counter: Counter, default):
    return counter.most_common(1)[0][0] if counter else default


def _guess_family(lines: list[_Line]) -> str:
    chars = sum(l.chars for l in lines) or 1
    mono = sum(l.mono_chars for l in lines)
    serif = sum(l.serif_chars for l in lines)
    if mono / chars > 0.5:
        return "mono"
    if serif / chars > 0.5:
        return "serif"
    # Some producers do not set the serif flag; fall back to the font name.
    fonts = Counter()
    for l in lines:
        fonts.update(l.fonts)
    name = _dominant(fonts, "").lower()
    if any(k in name for k in ("mono", "courier", "consol")):
        return "mono"
    if any(k in name for k in ("times", "serif", "georgia", "garamond",
                               "book", "cambria", "minion")):
        return "serif"
    return "sans"


def _guess_align(lines: list[_Line], rect: pymupdf.Rect,
                 page_rect: pymupdf.Rect, size: float) -> str:
    tol = max(2.0, size * 0.6)
    if len(lines) == 1:
        center = (rect.x0 + rect.x1) / 2
        page_center = (page_rect.x0 + page_rect.x1) / 2
        if abs(center - page_center) <= max(6.0, page_rect.width * 0.02) \
                and rect.x0 - page_rect.x0 > page_rect.width * 0.15:
            return "center"
        if page_rect.x1 - rect.x1 < page_rect.width * 0.12 \
                and rect.x0 - page_rect.x0 > page_rect.width * 0.3:
            return "right"
        return "left"
    lefts = [l.bbox.x0 - rect.x0 for l in lines]
    rights = [rect.x1 - l.bbox.x1 for l in lines]
    left_flat = max(lefts) - min(lefts) <= tol
    right_flat = max(rights) - min(rights) <= tol
    if left_flat and right_flat and len(lines) >= 3:
        return "justify"
    if left_flat:
        return "left"
    if right_flat:
        return "right"
    centered = all(abs(l - r) <= tol * 1.5 for l, r in zip(lefts, rights))
    if centered:
        return "center"
    return "left"


def _line_height(lines: list[_Line], size: float) -> float:
    if len(lines) < 2 or size <= 0:
        return 1.15
    gaps = [b.bbox.y0 - a.bbox.y0 for a, b in zip(lines, lines[1:])]
    gaps = [g for g in gaps if g > 0]
    if not gaps:
        return 1.15
    ratio = (sum(gaps) / len(gaps)) / size
    return max(1.0, min(2.2, ratio))


def _rotation(direction: tuple[float, float]) -> int:
    x, y = direction
    if abs(x) >= abs(y):
        return 0 if x >= 0 else 180
    return 270 if y > 0 else 90


def _make_segment(lines: list[_Line], page_rect: pymupdf.Rect) -> Segment | None:
    rect = pymupdf.Rect(lines[0].bbox)
    for line in lines[1:]:
        rect |= line.bbox
    if rect.width < 3 or rect.height < 3:
        return None
    text = _join_lines(lines)
    if not text:
        return None
    sizes, colors = Counter(), Counter()
    for line in lines:
        sizes.update(line.sizes)
        colors.update(line.colors)
    size = float(_dominant(sizes, 11.0))
    color = "#{:06x}".format(_dominant(colors, 0))
    chars = sum(l.chars for l in lines) or 1
    return Segment(
        rect=rect,
        text=text,
        size=size,
        color=color,
        bold=sum(l.bold_chars for l in lines) / chars > 0.5,
        italic=sum(l.italic_chars for l in lines) / chars > 0.5,
        family=_guess_family(lines),
        align=_guess_align(lines, rect, page_rect, size),
        line_height=_line_height(lines, size),
        lines=len(lines),
        rotate=_rotation(lines[0].dir),
    )


def _is_bold(line: _Line) -> bool:
    return line.bold_chars / (line.chars or 1) > 0.5


def _can_extend(group: list[_Line], frag: _Line) -> bool:
    """May ``frag`` continue the paragraph collected in ``group``?"""
    prev = group[-1]
    if prev.dir != frag.dir or _rotation(frag.dir) != 0:
        return False
    size_prev = float(_dominant(prev.sizes, 11.0))
    size_cur = float(_dominant(frag.sizes, 11.0))
    if not _sizes_close(size_prev, size_cur) or _is_bold(prev) != _is_bold(frag):
        return False
    size = max(size_prev, size_cur)
    dy = frag.bbox.y0 - prev.bbox.y0
    if dy <= 0.5 * size:      # same baseline: cells split at a gap on purpose
        return False
    if dy > 1.9 * size:       # blank line / table row spacing: new paragraph
        return False
    rect = pymupdf.Rect(group[0].bbox)
    for line in group[1:]:
        rect |= line.bbox
    overlap = min(rect.x1, frag.bbox.x1) - max(rect.x0, frag.bbox.x0)
    return overlap > 0.3 * min(rect.width, frag.bbox.width)


def extract_segments(page: pymupdf.Page) -> list[Segment]:
    """Return style-aware text segments of a page, in reading order."""
    data = page.get_text("dict")
    segments: list[Segment] = []
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        fragments: list[_Line] = []
        for raw in block.get("lines", []):
            fragments.extend(_line_fragments(raw))
        fragments = _merge_same_baseline(fragments)
        # Group consecutive fragments into paragraphs; start a new segment
        # when the style changes (heading vs body), the vertical rhythm
        # breaks (table rows), or the fragments do not stack vertically
        # (columns, cells on one baseline).
        group: list[_Line] = []
        groups: list[list[_Line]] = []
        for frag in fragments:
            if group and not _can_extend(group, frag):
                groups.append(group)
                group = []
            group.append(frag)
        if group:
            groups.append(group)
        for grp in groups:
            seg = _make_segment(grp, page.rect)
            if seg:
                segments.append(seg)
    log.debug("page %d: %d segments", page.number, len(segments))
    return segments
