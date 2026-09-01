"""End-to-end tests using the offline mock provider."""

import pymupdf
import pytest

from make_sample import build
from pdf_translator.core import translate_pdf
from pdf_translator.providers import (
    ClaudeTranslator,
    MockTranslator,
    _split_long,
    get_provider,
)


@pytest.fixture(scope="module")
def sample(tmp_path_factory):
    path = tmp_path_factory.mktemp("pdfs") / "sample_de.pdf"
    build(str(path))
    return path


@pytest.fixture(scope="module")
def translated(sample, tmp_path_factory):
    out = tmp_path_factory.mktemp("pdfs-out") / "sample_uk.pdf"
    provider = MockTranslator("de", "uk")
    report = translate_pdf(str(sample), str(out), provider)
    return out, report


def _spans(page):
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            yield from line["spans"]


def test_structure_preserved(sample, translated):
    out, report = translated
    src = pymupdf.open(str(sample))
    dst = pymupdf.open(str(out))
    assert dst.page_count == src.page_count == 2
    # raster image and vector drawings survive
    assert len(dst[0].get_images()) == len(src[0].get_images()) == 1
    assert len(dst[0].get_drawings()) >= len(src[0].get_drawings()) > 0
    assert report.translated > 10


def test_text_is_translated_to_cyrillic(translated):
    out, _ = translated
    doc = pymupdf.open(str(out))
    text = doc[0].get_text()
    assert "Договір" in text          # "Mietvertrag" via mock dictionary
    assert "Mietvertrag" not in text  # original German is gone


def test_numbers_left_untouched(translated):
    out, _ = translated
    doc = pymupdf.open(str(out))
    assert "1.160,00" in doc[1].get_text()


def test_title_keeps_position_size_color_and_weight(sample, translated):
    out, _ = translated
    doc = pymupdf.open(str(out))
    title_rect = pymupdf.Rect(50, 108, 547, 148)  # original title box + slack
    hits = [s for s in _spans(doc[0]) if "Договір" in s["text"]]
    assert hits, "translated title not found"
    span = max(hits, key=lambda s: s["size"])
    assert pymupdf.Rect(span["bbox"]).intersects(title_rect)
    assert span["bbox"][1] >= title_rect.y0 - 2
    assert span["size"] >= 21 * 0.5          # same 21pt unless shrunk to fit
    assert "bold" in span["font"].lower()
    r = (span["color"] >> 16) & 255
    g = (span["color"] >> 8) & 255
    b = span["color"] & 255
    assert b > r and b > g                   # still the blue heading


def test_red_note_keeps_color(translated):
    out, _ = translated
    doc = pymupdf.open(str(out))
    reds = [s for s in _spans(doc[0])
            if ((s["color"] >> 16) & 255) > 140
            and ((s["color"] >> 8) & 255) < 90]
    assert reds, "red note lost its color"
    assert any("Примітка" in s["text"] for s in reds)


def test_translated_text_stays_inside_original_boxes(sample, translated):
    out, _ = translated
    src = pymupdf.open(str(sample))
    dst = pymupdf.open(str(out))
    for pno in range(src.page_count):
        original_area = pymupdf.Rect()
        for span in _spans(src[pno]):
            original_area |= span["bbox"]
        original_area += (-3, -3, 3, 3)
        for span in _spans(dst[pno]):
            assert original_area.contains(pymupdf.Rect(span["bbox"])), (
                f"page {pno + 1}: span escaped the original text area: "
                f"{span['text']!r} {span['bbox']}")


def test_table_cells_stay_separate(translated):
    out, _ = translated
    doc = pymupdf.open(str(out))
    spans = list(_spans(doc[1]))
    header = next(s for s in spans if "Посітіон" in s["text"])  # "Position"
    amount = next(s for s in spans if "940,00" in s["text"])
    assert "940,00" not in header["text"], "table cells were merged"
    assert header["bbox"][2] < 300      # left cell stays in the left column
    assert amount["bbox"][0] > 280      # amount stays in the right column


def test_amount_column_stays_right_aligned(translated):
    out, _ = translated
    doc = pymupdf.open(str(out))
    amounts = [s for s in _spans(doc[1])
               if any(v in s["text"] for v in ("940,00", "220,00", "1.160,00"))]
    assert len(amounts) == 3
    right_edges = [s["bbox"][2] for s in amounts]
    # all glued to the table column edge (x=418), none across the border
    assert max(right_edges) - min(right_edges) < 3
    assert max(right_edges) <= 420.5


def test_headings_grow_instead_of_shrinking(translated):
    out, report = translated
    doc = pymupdf.open(str(out))
    # "§ 2 Mietzeit und Miete" translates longer than its tight box, but has
    # free space to the right — it must keep (almost) its 13pt size.
    span = next(s for s in _spans(doc[0]) if "Міетзеіт" in s["text"])
    assert span["size"] >= 12.0
    assert not any(scale < 0.9 for page in report.pages
                   for scale, _ in page.shrunk), report.summary()


def test_split_long():
    text = "Erster Satz. Zweiter Satz! Dritter Satz? " * 30
    chunks = _split_long(text.strip(), 200)
    assert all(len(c) <= 200 for c in chunks)
    assert " ".join(chunks).split() == text.split()
    assert _split_long("kurz", 200) == ["kurz"]


def test_claude_reply_parsing():
    reply = ('<seg id="0">Договір оренди</seg>\n'
             '<seg id="2">Багато\nрядків</seg>')
    found = dict(ClaudeTranslator._SEG.findall(reply))
    assert found["0"] == "Договір оренди"
    assert found["2"] == "Багато\nрядків"


def test_cache_roundtrip(tmp_path):
    cache = tmp_path / "cache.json"
    first = MockTranslator("de", "uk", cache_path=str(cache))
    assert first.translate_batch(["Vertrag und Miete"]) == \
        ["Договір і Орендна плата"]
    second = MockTranslator("de", "uk", cache_path=str(cache))
    second._translate_one = None  # would crash if the cache were missed
    assert second.translate_batch(["Vertrag und Miete"]) == \
        ["Договір і Орендна плата"]


def test_get_provider_rejects_unknown():
    from pdf_translator.providers import TranslationError
    with pytest.raises(TranslationError):
        get_provider("nope", "de", "uk")
