"""End-to-end test of webapp/index.html in headless Chromium (Playwright).

Runs two generated documents through the page in demo mode (no window.claude
-> transliteration exercises the same extract/translate/rebuild pipeline):
the 2-page sample and the 14-page stress document. Verifies the hard rules:

- translated (Cyrillic) spans never intersect source images;
- translated spans never materially overlap each other;
- a caption drawn over a photo stays untouched;
- page counts and images survive.

CDN scripts can be rerouted to local copies for offline runs: put
pdf.min.js, pdf.worker.min.js, pdf-lib.min.js, fontkit.umd.min.js into the
directory named by WEBTEST_LIBS (npm: pdfjs-dist@3.11.174, pdf-lib@1.17.1,
@pdf-lib/fontkit@1.1.1).

Usage:
    pip install playwright pymupdf
    [WEBTEST_LIBS=path] [WEBTEST_CHROMIUM=path] python3 webapp/webtest.py
"""

import base64
import http.server
import os
import sys
import tempfile
import threading
from pathlib import Path

import pymupdf
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
LIBS = Path(os.environ.get("WEBTEST_LIBS", HERE / ".libs"))
CHROMIUM = os.environ.get("WEBTEST_CHROMIUM")  # e.g. /opt/pw-browsers/chromium
CDN = ["pdf.min.js", "pdf.worker.min.js", "pdf-lib.min.js", "fontkit.umd.min.js"]

sys.path.insert(0, str(HERE.parent / "examples"))
from make_sample import build as build_sample  # noqa: E402
from make_stress import build as build_stress  # noqa: E402


def serve(directory: Path) -> int:
    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(
        *a, directory=str(directory), **kw)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


def run_in_browser(page, port, pdf_path: Path, out_path: Path) -> str:
    page.goto(f"http://127.0.0.1:{port}/index.html")
    page.wait_for_selector("#drop")
    assert page.is_visible("#demoBanner"), "demo banner should show without claude"
    page.set_input_files("#file", str(pdf_path))
    page.wait_for_function("window.__getResult() != null", timeout=300000)
    page.wait_for_selector("#summary:not([hidden])")
    b64 = page.evaluate(
        "() => { const b = window.__getResult();"
        " let s=''; for (let i=0;i<b.length;i+=32768)"
        " s += String.fromCharCode.apply(null, b.subarray(i, i+32768));"
        " return btoa(s); }")
    out_path.write_bytes(base64.b64decode(b64))
    return page.inner_text("#summary")


def cyr_spans(page):
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for line in b["lines"]:
            for span in line["spans"]:
                if any(0x400 <= ord(c) <= 0x4FF for c in span["text"]):
                    yield span


def check(src_path: Path, out_path: Path, name: str) -> pymupdf.Document:
    src = pymupdf.open(str(src_path))
    dst = pymupdf.open(str(out_path))
    assert dst.page_count == src.page_count, f"{name}: page count changed"
    problems = []
    for pno in range(src.page_count):
        imgs = [pymupdf.Rect(i["bbox"]) for i in src[pno].get_image_info()]
        assert len(dst[pno].get_images()) == len(src[pno].get_images()), \
            f"{name} p{pno + 1}: image lost"
        spans = [(s["text"], pymupdf.Rect(s["bbox"])) for s in cyr_spans(dst[pno])]
        for text, r in spans:
            for ir in imgs:
                inter = r & ir
                if not inter.is_empty and inter.get_area() > 2:
                    problems.append(f"{name} p{pno + 1}: text over image: "
                                    f"{text[:40]!r} {r} vs {ir}")
        for i in range(len(spans)):
            for j in range(i + 1, len(spans)):
                a, b = spans[i][1], spans[j][1]
                inter = a & b
                if inter.is_empty:
                    continue
                vo = min(a.y1, b.y1) - max(a.y0, b.y0)
                if inter.get_area() > 3 and vo > 0.5 * min(a.height, b.height):
                    problems.append(f"{name} p{pno + 1}: spans overlap: "
                                    f"{spans[i][0][:25]!r} / {spans[j][0][:25]!r}")
    for p in problems[:20]:
        print("PROBLEM:", p)
    assert not problems, f"{name}: {len(problems)} overlap problems"
    return dst


def main() -> int:
    workdir = Path(tempfile.mkdtemp(prefix="webtest-"))
    sample, stress = workdir / "sample_de.pdf", workdir / "stress_de.pdf"
    build_sample(str(sample))
    build_stress(str(stress))
    offline = LIBS.is_dir() and all((LIBS / f).is_file() for f in CDN)
    port = serve(HERE)
    with sync_playwright() as pw:
        launch = {"executable_path": CHROMIUM} if CHROMIUM else {}
        browser = pw.chromium.launch(**launch)
        page = browser.new_page(viewport={"width": 1200, "height": 900})
        page.on("pageerror", lambda e: print("PAGEERROR:", str(e)[:300]))

        def route_cdn(route):
            url = route.request.url
            if offline:
                for n in CDN:
                    if url.endswith(n):
                        route.fulfill(path=str(LIBS / n),
                                      content_type="application/javascript")
                        return
                if "fonts.googleapis.com" in url:
                    route.fulfill(body="", content_type="text/css")
                    return
            route.continue_()
        page.route("**/*", route_cdn)

        print(run_in_browser(page, port, sample, workdir / "sample_uk.pdf"))
        print(run_in_browser(page, port, stress, workdir / "stress_uk.pdf"))
        browser.close()

    out = check(sample, workdir / "sample_uk.pdf", "sample")
    assert "Договір" in out[0].get_text(), "sample title not translated"
    st = check(stress, workdir / "stress_uk.pdf", "stress")
    # caption drawn over the photo must stay in German, untouched
    assert "Blick auf den Innenhof" in st[2].get_text(), "photo caption replaced"
    # page 14: long heading translated and clear of the image at its right
    top = [s for s in cyr_spans(st[13]) if s["bbox"][1] < 130 and s["bbox"][0] < 410]
    assert top, "page 14 heading not translated"
    for s in top:
        assert s["bbox"][2] <= 421, f"page 14 heading over image: {s['bbox']}"
    print("ALL WEB CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
