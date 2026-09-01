#!/usr/bin/env python3
"""Build webapp/index.html: inline subset fonts into template.html.

Usage: python3 build_webapp.py <fonts_dir> [template] [output]
fonts_dir must contain sans-r.ttf sans-b.ttf sans-i.ttf sans-bi.ttf
serif-r.ttf serif-b.ttf mono-r.ttf (see README for the subsetting command).
"""

import base64
import sys
from pathlib import Path

FACES = ["sans-r", "sans-b", "sans-i", "sans-bi", "serif-r", "serif-b", "mono-r"]


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    fonts_dir = Path(sys.argv[1])
    here = Path(__file__).parent
    template = Path(sys.argv[2]) if len(sys.argv) > 2 else here / "template.html"
    output = Path(sys.argv[3]) if len(sys.argv) > 3 else here / "index.html"
    html = template.read_text("utf-8")
    for face in FACES:
        data = base64.b64encode((fonts_dir / f"{face}.ttf").read_bytes()).decode()
        placeholder = "%%FONT_" + face.replace("-", "_") + "%%"
        if placeholder not in html:
            print(f"error: {placeholder} not in template")
            return 1
        html = html.replace(placeholder, data)
    output.write_text(html, "utf-8")
    print(f"written: {output} ({output.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
