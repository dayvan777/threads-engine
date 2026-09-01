"""Generate a 14-page German stress-test PDF for the layout-preserving
translator: long wrapping headings, headings squeezed next to images,
captions on top of photos, dense tables with wrapped multi-line cells,
label/value grids, floated images with narrow text columns.

Usage: python examples/make_stress.py [out.pdf]
"""

from __future__ import annotations

import sys

import pymupdf

BLUE = (0.05, 0.15, 0.45)
GRAY = (0.45, 0.45, 0.45)
DARK = (0.15, 0.15, 0.18)

BODY = (
    "Die Vertragsparteien vereinbaren, dass die Nutzung der Räume "
    "ausschließlich zu Wohnzwecken erfolgt. Eine gewerbliche Nutzung bedarf "
    "der vorherigen schriftlichen Zustimmung des Vermieters. Der Mieter hat "
    "die Hausordnung zu beachten und auf die Belange der übrigen Bewohner "
    "Rücksicht zu nehmen."
)
BODY2 = (
    "Schönheitsreparaturen während der Mietzeit übernimmt der Mieter auf "
    "eigene Kosten, soweit sie durch den vertragsgemäßen Gebrauch der "
    "Mieträume erforderlich geworden sind. Dazu gehören das Streichen der "
    "Wände und Decken sowie der Heizkörper und Innentüren."
)
NARROW = (
    "Der Zählerstand für Strom und Gas wird bei der Übergabe gemeinsam "
    "abgelesen und im Protokoll festgehalten. Spätere Einwände gegen die "
    "dokumentierten Werte sind ausgeschlossen."
)


def _pixmap(w: int, h: int, bands) -> pymupdf.Pixmap:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, w, h))
    step = max(1, h // len(bands))
    for i, color in enumerate(bands):
        pix.set_rect(pymupdf.IRect(0, i * step, w, min(h, (i + 1) * step)), color)
    return pix


def _tb(page, rect, text, **kw):
    rv = page.insert_textbox(pymupdf.Rect(rect), text, **kw)
    assert rv >= 0, f"textbox too small for {text[:40]!r} ({-rv:.1f}pt missing)"


def _footer(page, n, total):
    _tb(page, (50, 806, 545, 822), f"Seite {n} von {total}",
        fontname="helv", fontsize=9, align=2)


def build(path: str) -> None:
    doc = pymupdf.open()
    total = 14

    # --- page 1: wrapping title, image next to a heading -------------------
    page = doc.new_page()
    _tb(page, (50, 60, 545, 130),
        "Rahmenvertrag über die Vermietung und Verwaltung von Wohnräumen "
        "im Bestand der Genossenschaft",
        fontname="hebo", fontsize=19, color=BLUE, align=1)
    # image on the right, heading on the left that must NOT grow over it
    page.insert_image(pymupdf.Rect(380, 150, 545, 260),
                      pixmap=_pixmap(160, 110, [(196, 120, 40), (240, 200, 120), (90, 60, 20)]))
    page.insert_text((50, 170), "§ 1 Gegenstand", fontname="hebo", fontsize=14)
    _tb(page, (50, 182, 360, 262), BODY, fontname="helv", fontsize=10.5, align=3)
    _tb(page, (50, 300, 545, 380), BODY2, fontname="helv", fontsize=11, align=3)
    _footer(page, 1, total)

    # --- page 2: dense 4-column table with wrapped cells --------------------
    page = doc.new_page()
    page.insert_text((50, 60), "Übersicht der laufenden Betriebskosten",
                     fontname="hebo", fontsize=13)
    cols = [(50, 160), (168, 300), (308, 420), (428, 545)]
    headers = ["Kostenart", "Beschreibung", "Verteilung", "Betrag je Jahr"]
    rows = [
        ("Grundsteuer", "Öffentliche Lasten des Grundstücks laut Bescheid",
         "nach Wohnfläche", "412,00 EUR"),
        ("Wasserversorgung", "Kosten des Wasserverbrauchs und der Grundgebühren",
         "nach Verbrauch", "388,50 EUR"),
        ("Gartenpflege", "Pflege der gemeinschaftlichen Grünflächen und Wege",
         "nach Wohnfläche", "96,00 EUR"),
        ("Beleuchtung", "Strom für Treppenhaus, Keller und Außenbeleuchtung",
         "nach Wohneinheiten", "54,20 EUR"),
    ]
    y = 80
    for x0, x1 in cols:
        _tb(page, (x0, y, x1, y + 16), headers[cols.index((x0, x1))],
            fontname="hebo", fontsize=9)
    page.draw_line((50, y + 16), (545, y + 16), color=DARK, width=0.8)
    y += 22
    for row in rows:
        for (x0, x1), cell in zip(cols, row):
            align = 2 if x1 == 545 else 0
            _tb(page, (x0, y, x1, y + 34), cell, fontname="helv", fontsize=9,
                align=align)
        page.draw_line((50, y + 34), (545, y + 34), color=GRAY, width=0.4)
        y += 40
    _tb(page, (50, y + 10, 545, y + 60),
        "Die Abrechnung erfolgt jährlich bis zum 30. Juni des Folgejahres. "
        "Guthaben werden mit der nächsten Miete verrechnet.",
        fontname="helv", fontsize=10, align=3)
    _footer(page, 2, total)

    # --- page 3: caption ON a photo + heading right above an image ----------
    page = doc.new_page()
    page.insert_text((50, 60), "Objektfotos und Lagebeschreibung",
                     fontname="hebo", fontsize=13)
    img = pymupdf.Rect(50, 80, 545, 300)
    page.insert_image(img, pixmap=_pixmap(495, 220,
                      [(70, 110, 160), (120, 160, 200), (60, 90, 60), (150, 120, 80)]))
    # white caption ON the photo — must stay untouched (no patch allowed)
    _tb(page, (60, 262, 400, 290), "Blick auf den Innenhof der Anlage",
        fontname="hebo", fontsize=13, color=(1, 1, 1))
    # heading immediately above another image, almost touching it
    page.insert_text((50, 340), "Umgebung und Verkehrsanbindung",
                     fontname="hebo", fontsize=12)
    page.insert_image(pymupdf.Rect(50, 346, 260, 450),
                      pixmap=_pixmap(210, 104, [(200, 180, 60), (100, 140, 60)]))
    _tb(page, (280, 350, 545, 470), NARROW,
        fontname="helv", fontsize=10, align=3)
    _footer(page, 3, total)

    # --- pages 4..13: varied body pages -------------------------------------
    for n in range(4, 14):
        page = doc.new_page()
        page.insert_text((50, 60), f"§ {n} Ergänzende Vereinbarungen",
                         fontname="hebo", fontsize=13)
        _tb(page, (50, 75, 545, 150), BODY if n % 2 else BODY2,
            fontname="helv", fontsize=10.5, align=3)
        if n % 3 == 0:
            page.insert_image(pymupdf.Rect(380, 170, 545, 280),
                              pixmap=_pixmap(160, 104, [(90, 90, 140), (170, 170, 210)]))
            _tb(page, (50, 170, 360, 290), NARROW, fontname="helv",
                fontsize=10.5, align=3)
        else:
            _tb(page, (50, 170, 545, 250), NARROW + " " + BODY2,
                fontname="helv", fontsize=10.5, align=3)
        _tb(page, (50, 700, 545, 730),
            "Hinweis: Alle Angaben ohne Gewähr. Änderungen vorbehalten.",
            fontname="heit", fontsize=9, color=GRAY)
        _footer(page, n, total)

    # --- page 14: the troublesome one ---------------------------------------
    page = doc.new_page()
    # very long section heading that will wrap when translated, image at right
    page.insert_image(pymupdf.Rect(420, 52, 545, 140),
                      pixmap=_pixmap(125, 88, [(180, 70, 60), (230, 160, 150)]))
    _tb(page, (50, 55, 405, 118),
        "§ 14 Besondere Vereinbarungen zur Betriebskostenabrechnung "
        "und zu Schönheitsreparaturen",
        fontname="hebo", fontsize=14, color=BLUE)
    _tb(page, (50, 120, 405, 200), BODY2, fontname="helv", fontsize=10.5, align=3)
    # label/value grid
    grid = [
        ("Objektnummer", "WV-2026-1408"),
        ("Verwalter", "Hausverwaltung Schneider GmbH"),
        ("Abrechnungszeitraum", "1. Januar bis 31. Dezember"),
        ("Zahlungsweise", "monatlich im Voraus"),
    ]
    y = 240
    for label, value in grid:
        _tb(page, (50, y, 210, y + 18), label, fontname="hebo", fontsize=10)
        _tb(page, (220, y, 545, y + 18), value, fontname="helv", fontsize=10)
        y += 24
    # tight two-column table with wrapped cells
    page.insert_text((50, y + 20), "Fristenübersicht", fontname="hebo", fontsize=12)
    y += 36
    frows = [
        ("Kündigung durch den Mieter",
         "spätestens am dritten Werktag eines Monats zum Ablauf des übernächsten Monats"),
        ("Ankündigung von Modernisierungen",
         "drei Monate vor Beginn der Maßnahme in Textform"),
        ("Rückgabe der Wohnung",
         "am letzten Tag der Mietzeit bis 12 Uhr mit sämtlichen Schlüsseln"),
    ]
    for left, right in frows:
        _tb(page, (50, y, 235, y + 30), left, fontname="hebo", fontsize=9.5)
        _tb(page, (250, y, 545, y + 30), right, fontname="helv", fontsize=9.5)
        page.draw_line((50, y + 30, ), (545, y + 30), color=GRAY, width=0.4)
        y += 36
    _footer(page, 14, total)

    doc.save(path, deflate=True)
    doc.close()


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "stress_de.pdf"
    build(out)
    print(f"written: {out}")
