"""Generate a sample German PDF exercising the layouts the translator must keep:
headings, colors, bold/italic, alignment, columns, a table, images, page numbers.

Usage: python examples/make_sample.py [out.pdf]
"""

from __future__ import annotations

import sys

import pymupdf

BLUE = (0.05, 0.15, 0.45)
RED = (0.75, 0.1, 0.1)
GRAY = (0.45, 0.45, 0.45)

P1_BODY = (
    "Zwischen dem Vermieter und dem Mieter wird der folgende Vertrag über "
    "die Nutzung von Wohnraum geschlossen. Die Wohnung befindet sich im "
    "zweiten Obergeschoss des Hauses und besteht aus drei Zimmern, einer "
    "Küche, einem Bad sowie einem Kellerraum. Die Wohnfläche beträgt "
    "ungefähr 78 Quadratmeter."
)
P2_BODY = (
    "Das Mietverhältnis beginnt am 1. Oktober 2026 und läuft auf unbe-"
    "stimmte Zeit. Die monatliche Grundmiete beträgt 940 Euro zuzüglich "
    "einer Vorauszahlung für Betriebskosten in Höhe von 220 Euro. Die "
    "Miete ist jeweils im Voraus bis zum dritten Werktag eines Monats zu "
    "zahlen."
)
NOTE = (
    "Wichtiger Hinweis: Änderungen und Ergänzungen dieses Vertrages "
    "bedürfen der Schriftform."
)
COL_LEFT = (
    "Der Mieter verpflichtet sich, die Wohnung pfleglich zu behandeln und "
    "Schäden unverzüglich zu melden. Kleinere Reparaturen bis zu einem "
    "Betrag von 100 Euro im Einzelfall trägt der Mieter selbst."
)
COL_RIGHT = (
    "Der Vermieter garantiert, dass die Wohnung bei Übergabe frei von "
    "Mängeln ist. Eine Übergabe des Schlüssels erfolgt am ersten Werktag "
    "nach Vertragsbeginn in den Räumen der Hausverwaltung."
)


def _pixmap(width: int, height: int, color: tuple[int, int, int]) -> pymupdf.Pixmap:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, width, height))
    pix.set_rect(pix.irect, color)
    return pix


def _tb(page: pymupdf.Page, rect, text: str, **kw) -> None:
    rv = page.insert_textbox(pymupdf.Rect(rect), text, **kw)
    assert rv >= 0, f"textbox too small for {text[:30]!r} (missing {-rv:.2f}pt)"


def build(path: str) -> None:
    doc = pymupdf.open()

    page = doc.new_page()  # A4: 595 x 842
    # letterhead: company left, address right, both small
    page.insert_text((50, 60), "Hausverwaltung Schneider GmbH",
                     fontname="hebo", fontsize=13, color=BLUE)
    _tb(page, (340, 44, 545, 90), "Lindenstraße 12\n10115 Berlin",
        fontname="helv", fontsize=9, color=GRAY, align=2)
    page.draw_line((50, 92), (545, 92), color=BLUE, width=1.2)
    # centered title + italic subtitle
    _tb(page, (50, 108, 545, 148), "Mietvertrag für Wohnraum",
        fontname="hebo", fontsize=21, color=BLUE, align=1)
    _tb(page, (50, 148, 545, 170), "zwischen Vermieter und Mieter",
        fontname="heit", fontsize=12, color=GRAY, align=1)
    # right-aligned date
    _tb(page, (300, 180, 545, 200), "Berlin, den 1. September 2026",
        fontname="helv", fontsize=10, align=2)
    # section 1
    page.insert_text((50, 230), "§ 1 Mieträume", fontname="hebo", fontsize=13)
    _tb(page, (50, 240, 545, 320), P1_BODY,
        fontname="helv", fontsize=11, align=3)
    # section 2
    page.insert_text((50, 340), "§ 2 Mietzeit und Miete",
                     fontname="hebo", fontsize=13)
    _tb(page, (50, 350, 545, 430), P2_BODY,
        fontname="helv", fontsize=11, align=3)
    # red note
    _tb(page, (50, 450, 545, 490), NOTE,
        fontname="hebo", fontsize=10.5, color=RED)
    # an image (raster) and a vector logo that must survive untouched
    page.insert_image(pymupdf.Rect(50, 510, 170, 590),
                      pixmap=_pixmap(120, 80, (205, 125, 40)))
    page.draw_circle((300, 550), 32, color=BLUE, fill=(0.85, 0.9, 1), width=2)
    _tb(page, (200, 610, 400, 630), "Abbildung 1: Musterfoto der Wohnung",
        fontname="heit", fontsize=9, color=GRAY, align=1)
    # footer + page number
    _tb(page, (50, 790, 545, 806),
        "Hausverwaltung Schneider GmbH - Amtsgericht Berlin HRB 123456",
        fontname="helv", fontsize=8, color=GRAY, align=1)
    _tb(page, (440, 806, 545, 822), "Seite 1 von 2",
        fontname="helv", fontsize=9, align=2)

    page2 = doc.new_page()
    page2.insert_text((50, 60), "§ 3 Pflichten der Parteien",
                      fontname="hebo", fontsize=13)
    # two columns
    _tb(page2, (50, 75, 285, 190), COL_LEFT,
        fontname="helv", fontsize=10.5, align=3)
    _tb(page2, (310, 75, 545, 190), COL_RIGHT,
        fontname="helv", fontsize=10.5, align=3)
    # a small table
    page2.insert_text((50, 230), "Übersicht der Kosten",
                      fontname="hebo", fontsize=12)
    rows = [("Position", "Betrag"),
            ("Grundmiete", "940,00 EUR"),
            ("Betriebskosten", "220,00 EUR"),
            ("Gesamt", "1.160,00 EUR")]
    y = 250
    for i, (left, right) in enumerate(rows):
        font = "hebo" if i in (0, len(rows) - 1) else "helv"
        _tb(page2, (52, y, 280, y + 18), left, fontname=font, fontsize=10)
        _tb(page2, (282, y, 418, y + 18), right,
            fontname=font, fontsize=10, align=2)
        page2.draw_line((50, y + 16), (420, y + 16), color=GRAY, width=0.5)
        y += 22
    page2.draw_rect(pymupdf.Rect(50, 248, 420, y - 6), color=GRAY, width=0.8)
    _tb(page2, (440, 806, 545, 822), "Seite 2 von 2",
        fontname="helv", fontsize=9, align=2)

    doc.save(path, deflate=True)
    doc.close()


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "sample_de.pdf"
    build(out)
    print(f"written: {out}")
