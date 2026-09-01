"""Pipeline: extract segments -> translate -> re-typeset in place.

Only the text is touched: images, vector graphics, colors and the page
geometry stay as they are. Original text is removed with redactions
(no fill painted), and the translation is inserted into the exact same
bounding box with the original size, weight, color and alignment.
If a translation is longer than the original, insert_htmlbox shrinks it
just enough to fit the box.
"""

from __future__ import annotations

import html
import logging
from dataclasses import dataclass, field

import pymupdf

from .extract import Segment, extract_segments
from .fonts import FontSet
from .providers import BaseTranslator

log = logging.getLogger(__name__)

_REDACT_SHRINK = 0.3   # pt, keeps redactions from eating neighbouring lines
_INSERT_GROW = 1.0     # pt, tiny slack so equal-length text is not shrunk


@dataclass
class PageStats:
    number: int
    segments: int = 0
    translated: int = 0
    shrunk: list[tuple[float, str]] = field(default_factory=list)


@dataclass
class Report:
    pages: list[PageStats] = field(default_factory=list)

    @property
    def segments(self) -> int:
        return sum(p.segments for p in self.pages)

    @property
    def translated(self) -> int:
        return sum(p.translated for p in self.pages)

    def summary(self) -> str:
        lines = [f"pages: {len(self.pages)}, segments: {self.segments}, "
                 f"translated: {self.translated}"]
        for page in self.pages:
            for scale, text in page.shrunk:
                lines.append(
                    f"  page {page.number + 1}: text shrunk to {scale:.0%} "
                    f"to fit its box: {text[:60]!r}")
        return "\n".join(lines)


def _parse_pages(spec: str | None, page_count: int) -> list[int]:
    if not spec:
        return list(range(page_count))
    chosen: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            chosen.update(range(int(a) - 1, int(b)))
        elif part:
            chosen.add(int(part) - 1)
    return sorted(p for p in chosen if 0 <= p < page_count)


def _segment_css(seg: Segment, fonts: FontSet) -> str:
    weight = "font-weight: bold;" if seg.bold else ""
    style = "font-style: italic;" if seg.italic else ""
    return (
        f"{fonts.css()}\n"
        "body {margin: 0; padding: 0;}\n"
        f"div {{font-family: {fonts.family_name(seg.family)};"
        f" font-size: {seg.size:.1f}pt; color: {seg.color};"
        f" line-height: {seg.line_height:.2f}; text-align: {seg.align};"
        f" {weight} {style}}}"
    )


def _y_overlap(a: pymupdf.Rect, b: pymupdf.Rect) -> float:
    return min(a.y1, b.y1) - max(a.y0, b.y0)


def _detect_right_aligned_columns(segments: list[Segment]) -> None:
    """Mark stacked cells sharing a right edge as right-aligned.

    A single line in a tight box carries no alignment information of its
    own, but amounts in a table column all end on the same x while starting
    on different ones — a reliable right-alignment signal that keeps
    translated values glued to the column edge.
    """
    singles = [s for s in segments if s.lines == 1 and not s.rotate]
    singles.sort(key=lambda s: s.rect.x1)
    group: list[Segment] = []
    for seg in singles + [None]:
        if group and (seg is None
                      or seg.rect.x1 - group[-1].rect.x1 > 1.5):
            xs = [g.rect.x0 for g in group]
            column = max(xs) < min(g.rect.x1 for g in group) - 2
            if len(group) >= 3 and max(xs) - min(xs) > 3 and column:
                for g in group:
                    if g.align == "left":
                        g.align = "right"
            group = []
        if seg is not None:
            group.append(seg)


def _widen_single_line_rects(page: pymupdf.Page, segments: list[Segment]) -> None:
    """Give single-line segments room to grow instead of shrinking.

    Translations are often longer than the original. A heading or label sits
    in a tight box, but usually has free space next to it — extend the
    insertion box toward the nearest obstacle (other text, images, drawings)
    in the direction its alignment allows, so the translation keeps the
    original font size whenever the page has room for it.
    """
    if not segments:
        return
    content_x0 = min(s.rect.x0 for s in segments)
    content_x1 = max(s.rect.x1 for s in segments)
    obstacles = [s.rect for s in segments]
    try:
        obstacles += [pymupdf.Rect(info["bbox"]) for info in page.get_image_info()]
        obstacles += [d["rect"] for d in page.get_drawings()]
    except Exception as exc:
        log.debug("obstacle scan incomplete: %s", exc)
    for seg in segments:
        seg.insert_rect = pymupdf.Rect(seg.rect)
        if not seg.translatable or seg.lines > 1 or seg.rotate:
            continue
        rect = seg.rect
        band = [o for o in obstacles
                if o is not rect and _y_overlap(o, rect) > 0.3 * rect.height]
        right_limit = min(
            [o.x0 - 2 for o in band if o.x0 >= rect.x1 - 1]
            + [max(content_x1, rect.x1)])
        left_limit = max(
            [o.x1 + 2 for o in band if o.x1 <= rect.x0 + 1]
            + [min(content_x0, rect.x0)])
        if seg.align == "right":
            seg.insert_rect.x0 = min(rect.x0, left_limit)
        elif seg.align == "center":
            room = min(rect.x0 - left_limit, right_limit - rect.x1)
            if room > 0:
                seg.insert_rect.x0 -= room
                seg.insert_rect.x1 += room
        else:  # left, justify
            seg.insert_rect.x1 = max(rect.x1, right_limit)


def _insert_segment(page: pymupdf.Page, seg: Segment, fonts: FontSet,
                    archive: pymupdf.Archive) -> float:
    rect = pymupdf.Rect(seg.insert_rect or seg.rect)
    rect.x1 += _INSERT_GROW
    rect.y1 += _INSERT_GROW
    body = html.escape(seg.translation or seg.text)
    spare, scale = page.insert_htmlbox(
        rect,
        f"<div>{body}</div>",
        css=_segment_css(seg, fonts),
        archive=archive,
        scale_low=0,   # shrink as much as needed, never overflow the box
    )
    return scale


def _redact_segments(page: pymupdf.Page, segments: list[Segment]) -> None:
    for seg in segments:
        rect = pymupdf.Rect(
            seg.rect.x0 + _REDACT_SHRINK, seg.rect.y0 + _REDACT_SHRINK,
            seg.rect.x1 - _REDACT_SHRINK, seg.rect.y1 - _REDACT_SHRINK)
        page.add_redact_annot(rect, fill=False)
    try:
        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_NONE,
            graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
        )
    except TypeError:  # PyMuPDF < 1.23.27 has no graphics parameter
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)


def _restore_links(page: pymupdf.Page, links: list[dict]) -> None:
    """Re-insert links that the redactions removed."""
    existing = {tuple(round(v, 1) for v in l["from"]) for l in page.get_links()}
    for link in links:
        key = tuple(round(v, 1) for v in pymupdf.Rect(link["from"]))
        if key not in existing:
            try:
                page.insert_link(link)
            except Exception as exc:
                log.debug("could not restore link %s: %s", link, exc)


def translate_pdf(
    input_path: str,
    output_path: str,
    provider: BaseTranslator,
    *,
    pages: str | None = None,
    fonts_dir: str | None = None,
    min_scale_warn: float = 0.7,
) -> Report:
    """Translate ``input_path`` into ``output_path`` preserving the layout."""
    pymupdf.TOOLS.set_small_glyph_heights(True)
    fonts = FontSet([fonts_dir] if fonts_dir else None)
    archive = fonts.archive()
    doc = pymupdf.open(input_path)
    report = Report()

    page_numbers = _parse_pages(pages, doc.page_count)
    page_segments: dict[int, list[Segment]] = {}
    for number in page_numbers:
        page = doc[number]
        if page.rotation:
            page.remove_rotation()
        segments = extract_segments(page)
        _detect_right_aligned_columns(segments)
        _widen_single_line_rects(page, segments)
        if not segments and page.get_images():
            log.warning("page %d has no text layer (scanned image?) — "
                        "it is left as is; run OCR first if it must be "
                        "translated", number + 1)
        page_segments[number] = segments

    # Translate unique texts across the whole document in one batch.
    unique: dict[str, None] = {}
    for segments in page_segments.values():
        for seg in segments:
            if seg.translatable:
                unique.setdefault(seg.text)
    texts = list(unique)
    log.info("translating %d unique segments (%s -> %s, provider %s)",
             len(texts), provider.source, provider.target, provider.name)
    translations = dict(zip(texts, provider.translate_batch(texts)))

    for number in page_numbers:
        page = doc[number]
        segments = page_segments[number]
        stats = PageStats(number=number, segments=len(segments))
        todo = [s for s in segments if s.translatable]
        for seg in todo:
            seg.translation = translations.get(seg.text, seg.text)
        if todo:
            links = page.get_links()
            _redact_segments(page, todo)
            for seg in todo:
                seg.scale = _insert_segment(page, seg, fonts, archive)
                stats.translated += 1
                if seg.scale < min_scale_warn:
                    stats.shrunk.append((seg.scale, seg.translation or seg.text))
            _restore_links(page, links)
        report.pages.append(stats)
        log.info("page %d: %d/%d segments translated",
                 number + 1, stats.translated, stats.segments)

    try:
        doc.subset_fonts()  # embed only the glyphs actually used
    except Exception as exc:
        log.debug("font subsetting skipped: %s", exc)
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()
    return report
