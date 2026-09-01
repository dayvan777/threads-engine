"""Cyrillic-capable replacement fonts for rebuilding translated text.

Fonts embedded in a German PDF almost never contain Ukrainian glyphs
(і, ї, є, ґ ...), so translated text must be set in a replacement font.
This module locates font families on the system that cover Ukrainian,
keeps the original's serif/sans/mono classification and bold/italic
variants, and exposes them as CSS @font-face rules + a pymupdf Archive
for Page.insert_htmlbox().
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path

import pymupdf

log = logging.getLogger(__name__)

# Characters that must be present for Ukrainian coverage.
_REQUIRED_CHARS = "іїєґяжщьІЇЄҐ"

# Candidate variant file names per family, in priority order.
# Tuple: (regular, bold, italic, bold-italic); names are matched
# case-insensitively against files found in the search directories.
_CANDIDATES: dict[str, list[tuple[str, str, str, str]]] = {
    "sans": [
        ("NotoSans-Regular.ttf", "NotoSans-Bold.ttf",
         "NotoSans-Italic.ttf", "NotoSans-BoldItalic.ttf"),
        ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf",
         "DejaVuSans-Oblique.ttf", "DejaVuSans-BoldOblique.ttf"),
        ("LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf",
         "LiberationSans-Italic.ttf", "LiberationSans-BoldItalic.ttf"),
        ("FreeSans.ttf", "FreeSansBold.ttf",
         "FreeSansOblique.ttf", "FreeSansBoldOblique.ttf"),
    ],
    "serif": [
        ("NotoSerif-Regular.ttf", "NotoSerif-Bold.ttf",
         "NotoSerif-Italic.ttf", "NotoSerif-BoldItalic.ttf"),
        ("DejaVuSerif.ttf", "DejaVuSerif-Bold.ttf",
         "DejaVuSerif-Italic.ttf", "DejaVuSerif-BoldItalic.ttf"),
        ("LiberationSerif-Regular.ttf", "LiberationSerif-Bold.ttf",
         "LiberationSerif-Italic.ttf", "LiberationSerif-BoldItalic.ttf"),
        ("FreeSerif.ttf", "FreeSerifBold.ttf",
         "FreeSerifItalic.ttf", "FreeSerifBoldItalic.ttf"),
    ],
    "mono": [
        ("NotoSansMono-Regular.ttf", "NotoSansMono-Bold.ttf", "", ""),
        ("DejaVuSansMono.ttf", "DejaVuSansMono-Bold.ttf",
         "DejaVuSansMono-Oblique.ttf", "DejaVuSansMono-BoldOblique.ttf"),
        ("LiberationMono-Regular.ttf", "LiberationMono-Bold.ttf",
         "LiberationMono-Italic.ttf", "LiberationMono-BoldItalic.ttf"),
        ("FreeMono.ttf", "FreeMonoBold.ttf",
         "FreeMonoOblique.ttf", "FreeMonoBoldOblique.ttf"),
    ],
}

_SEARCH_DIRS = [
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    "~/.fonts",
    "~/.local/share/fonts",
    "/Library/Fonts",
    "/System/Library/Fonts",
    "/System/Library/Fonts/Supplemental",
    "C:/Windows/Fonts",
]


@dataclass
class FontFamily:
    name: str          # CSS family name used in generated HTML
    regular: Path
    bold: Path
    italic: Path
    bold_italic: Path

    def files(self) -> set[Path]:
        return {self.regular, self.bold, self.italic, self.bold_italic}

    def css(self) -> str:
        rules = [
            f'@font-face {{font-family: {self.name}; src: url("{self.regular.name}");}}',
            f'@font-face {{font-family: {self.name}; src: url("{self.bold.name}"); font-weight: bold;}}',
            f'@font-face {{font-family: {self.name}; src: url("{self.italic.name}"); font-style: italic;}}',
            f'@font-face {{font-family: {self.name}; src: url("{self.bold_italic.name}"); '
            f"font-weight: bold; font-style: italic;}}",
        ]
        return "\n".join(rules)


class FontSet:
    """Resolved sans/serif/mono families with Ukrainian coverage."""

    def __init__(self, extra_dirs: list[str] | None = None):
        index = self._index_fonts(extra_dirs or [])
        self.families: dict[str, FontFamily] = {}
        for kind, candidates in _CANDIDATES.items():
            fam = self._pick_family(kind, candidates, index)
            if fam:
                self.families[kind] = fam
        if "sans" not in self.families and "serif" in self.families:
            self.families["sans"] = self.families["serif"]
        if "serif" not in self.families and "sans" in self.families:
            self.families["serif"] = self.families["sans"]
        if "mono" not in self.families and "sans" in self.families:
            self.families["mono"] = self.families["sans"]
        if not self.families:
            raise RuntimeError(
                "No Cyrillic-capable fonts found. Install DejaVu or Noto fonts "
                "(e.g. `apt install fonts-dejavu`) or pass --fonts-dir pointing "
                "to a directory with .ttf files covering Ukrainian."
            )
        for kind, fam in self.families.items():
            log.info("font[%s] -> %s", kind, fam.regular)

    @staticmethod
    def _index_fonts(extra_dirs: list[str]) -> dict[str, Path]:
        env_dir = os.environ.get("PDF_TRANSLATOR_FONTS")
        dirs = list(extra_dirs)
        if env_dir:
            dirs.append(env_dir)
        dirs += _SEARCH_DIRS
        index: dict[str, Path] = {}
        for d in dirs:
            root = Path(os.path.expanduser(d))
            if not root.is_dir():
                continue
            for path in root.rglob("*.tt[fc]"):
                index.setdefault(path.name.lower(), path)
            for path in root.rglob("*.otf"):
                index.setdefault(path.name.lower(), path)
        return index

    @staticmethod
    def _covers_ukrainian(path: Path) -> bool:
        try:
            font = pymupdf.Font(fontfile=str(path))
        except Exception:
            return False
        return all(font.has_glyph(ord(ch)) for ch in _REQUIRED_CHARS)

    def _pick_family(
        self,
        kind: str,
        candidates: list[tuple[str, str, str, str]],
        index: dict[str, Path],
    ) -> FontFamily | None:
        for regular, bold, italic, bold_italic in candidates:
            reg_path = index.get(regular.lower())
            if not reg_path or not self._covers_ukrainian(reg_path):
                continue
            # Missing variants fall back to the regular face.
            return FontFamily(
                name=f"tr{kind}",
                regular=reg_path,
                bold=index.get(bold.lower(), reg_path),
                italic=index.get(italic.lower(), reg_path),
                bold_italic=index.get(bold_italic.lower(),
                                      index.get(bold.lower(), reg_path)),
            )
        return None

    def family_name(self, kind: str) -> str:
        fam = self.families.get(kind) or self.families["sans"]
        return fam.name

    def css(self) -> str:
        seen, parts = set(), []
        for fam in self.families.values():
            if fam.name in seen:
                continue
            seen.add(fam.name)
            parts.append(fam.css())
        return "\n".join(parts)

    def archive(self) -> pymupdf.Archive:
        arch = pymupdf.Archive()
        dirs = {f.parent for fam in self.families.values() for f in fam.files()}
        for d in dirs:
            arch.add(str(d))
        return arch
