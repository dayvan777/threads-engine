"""Command-line interface: pdf-translate / python -m pdf_translator."""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

from . import __version__
from .core import translate_pdf
from .providers import TranslationError, get_provider


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pdf-translate",
        description="Translate a PDF (default German -> Ukrainian) while "
                    "preserving layout: positions, font sizes, styles, "
                    "colors, images and graphics.",
    )
    parser.add_argument("input", help="input PDF file")
    parser.add_argument("-o", "--output",
                        help="output PDF (default: <input>.<target>.pdf)")
    parser.add_argument("--provider", default="google",
                        choices=["google", "deepl", "claude", "libre", "mock"],
                        help="translation engine (default: google — free, "
                             "no API key needed)")
    parser.add_argument("--source", default="de",
                        help="source language code (default: de)")
    parser.add_argument("--target", default="uk",
                        help="target language code (default: uk)")
    parser.add_argument("--pages",
                        help="pages to translate, e.g. '1-3,7' (default: all)")
    parser.add_argument("--cache",
                        help="JSON file to cache translations between runs")
    parser.add_argument("--fonts-dir",
                        help="extra directory with .ttf fonts covering "
                             "Ukrainian (also: PDF_TRANSLATOR_FONTS env var)")
    parser.add_argument("--deepl-key", help="DeepL API key (or DEEPL_API_KEY)")
    parser.add_argument("--model", default=None,
                        help="model for --provider claude "
                             "(default: claude-opus-5)")
    parser.add_argument("--libre-url", default=None,
                        help="LibreTranslate base URL for --provider libre")
    parser.add_argument("--libre-key", default=None,
                        help="LibreTranslate API key for --provider libre")
    parser.add_argument("--min-scale-warn", type=float, default=0.7,
                        help="warn when text had to be shrunk below this "
                             "factor to fit its box (default: 0.7)")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="verbose logging")
    parser.add_argument("--version", action="version",
                        version=f"%(prog)s {__version__}")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    input_path = Path(args.input)
    if not input_path.is_file():
        print(f"error: no such file: {input_path}", file=sys.stderr)
        return 2
    output = args.output or str(
        input_path.with_suffix(f".{args.target}{input_path.suffix}"))

    try:
        provider = get_provider(
            args.provider, args.source, args.target,
            cache_path=args.cache,
            deepl_key=args.deepl_key,
            model=args.model,
            libre_url=args.libre_url,
            libre_key=args.libre_key,
        )
        started = time.time()
        report = translate_pdf(
            str(input_path), output, provider,
            pages=args.pages,
            fonts_dir=args.fonts_dir,
            min_scale_warn=args.min_scale_warn,
        )
    except TranslationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(report.summary())
    print(f"done in {time.time() - started:.1f}s -> {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
