"""End-to-end test of webapp/index.html in headless Chromium (Playwright).

Without window.claude the page runs in demo mode (transliteration), which
exercises the same extract -> translate -> rebuild -> preview pipeline as
production. CDN scripts can be rerouted to local copies for offline runs:
put pdf.min.js, pdf.worker.min.js, pdf-lib.min.js, fontkit.umd.min.js into
the directory named by WEBTEST_LIBS (they are on npm: pdfjs-dist@3.11.174,
pdf-lib@1.17.1, @pdf-lib/fontkit@1.1.1).

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

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
LIBS = Path(os.environ.get("WEBTEST_LIBS", HERE / ".libs"))
CHROMIUM = os.environ.get("WEBTEST_CHROMIUM")  # e.g. /opt/pw-browsers/chromium

CDN_FILES = ["pdf.min.js", "pdf.worker.min.js", "pdf-lib.min.js", "fontkit.umd.min.js"]


def serve(directory: Path) -> int:
    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(
        *a, directory=str(directory), **kw)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


def main() -> int:
    workdir = Path(tempfile.mkdtemp(prefix="webtest-"))
    sample = workdir / "sample_de.pdf"
    out_pdf = workdir / "web_result.pdf"
    sys.path.insert(0, str(HERE.parent / "examples"))
    from make_sample import build
    build(str(sample))

    offline = LIBS.is_dir() and all((LIBS / f).is_file() for f in CDN_FILES)
    port = serve(HERE)
    with sync_playwright() as pw:
        launch = {"executable_path": CHROMIUM} if CHROMIUM else {}
        browser = pw.chromium.launch(**launch)
        page = browser.new_page(viewport={"width": 1200, "height": 900})
        page.on("pageerror", lambda e: print("PAGEERROR:", str(e)[:300]))

        def route_cdn(route):
            url = route.request.url
            if offline:
                for name in CDN_FILES:
                    if url.endswith(name):
                        route.fulfill(path=str(LIBS / name),
                                      content_type="application/javascript")
                        return
                if "fonts.googleapis.com" in url:
                    route.fulfill(body="", content_type="text/css")
                    return
            route.continue_()

        page.route("**/*", route_cdn)
        page.goto(f"http://127.0.0.1:{port}/index.html")
        page.wait_for_selector("#drop")
        assert page.is_visible("#demoBanner"), "demo banner should show without claude"
        page.set_input_files("#file", str(sample))
        page.wait_for_function("window.__getResult() != null", timeout=180000)
        page.wait_for_selector("#summary:not([hidden])")
        page.wait_for_selector(".pagepair canvas")
        print("summary:", page.inner_text("#summary"))

        b64 = page.evaluate(
            "() => { const b = window.__getResult();"
            " let s=''; for (let i=0;i<b.length;i+=32768)"
            " s += String.fromCharCode.apply(null, b.subarray(i, i+32768));"
            " return btoa(s); }")
        out_pdf.write_bytes(base64.b64decode(b64))
        browser.close()

    import pymupdf
    src = pymupdf.open(str(sample))
    doc = pymupdf.open(str(out_pdf))
    assert doc.page_count == src.page_count == 2, "page count changed"
    assert "Договір" in doc[0].get_text(), "translated title missing"
    assert len(doc[0].get_images()) == 1, "image lost"
    assert "1.160,00" in doc[1].get_text(), "table numbers lost"
    for pno in range(2):
        area = pymupdf.Rect()
        for b in src[pno].get_text("dict")["blocks"]:
            if b.get("type") == 0:
                area |= b["bbox"]
        area += (-4, -4, 4, 4)
        for b in doc[pno].get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            for line in b["lines"]:
                for span in line["spans"]:
                    if not any(0x400 <= ord(c) <= 0x4FF for c in span["text"]):
                        continue
                    assert area.contains(pymupdf.Rect(span["bbox"])), (
                        f"page {pno + 1}: span out of area: "
                        f"{span['text']!r} {span['bbox']}")
    print("ALL WEB CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
