"""Translation providers: Google (free), DeepL, Claude, LibreTranslate, mock.

All providers implement ``translate_batch(list[str]) -> list[str]`` with an
in-memory (and optional on-disk JSON) cache, so repeated strings — page
headers, footers — are translated once.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path

log = logging.getLogger(__name__)

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?;:])\s+")


class TranslationError(RuntimeError):
    pass


def _split_long(text: str, limit: int) -> list[str]:
    """Split text into <=limit chunks at sentence (or word) boundaries."""
    if len(text) <= limit:
        return [text]
    chunks, current = [], ""
    for part in _SENTENCE_SPLIT.split(text):
        while len(part) > limit:  # a single monster sentence
            cut = part.rfind(" ", 0, limit)
            cut = cut if cut > 0 else limit
            piece, part = part[:cut], part[cut:].lstrip()
            if current:
                chunks.append(current)
                current = ""
            chunks.append(piece)
        if len(current) + len(part) + 1 > limit and current:
            chunks.append(current)
            current = part
        else:
            current = f"{current} {part}".strip()
    if current:
        chunks.append(current)
    return chunks


class BaseTranslator:
    name = "base"
    max_chars = 0  # per-request character limit, 0 = unlimited

    def __init__(self, source: str, target: str, cache_path: str | None = None):
        self.source = source
        self.target = target
        self._cache: dict[str, str] = {}
        self._cache_path = Path(cache_path) if cache_path else None
        if self._cache_path and self._cache_path.exists():
            try:
                self._cache = json.loads(self._cache_path.read_text("utf-8"))
                log.info("cache: loaded %d entries", len(self._cache))
            except Exception as exc:
                log.warning("cache: could not read %s (%s)", self._cache_path, exc)

    # -- public API ---------------------------------------------------------
    def translate_batch(self, texts: list[str]) -> list[str]:
        result: list[str | None] = [None] * len(texts)
        todo: list[str] = []
        positions: list[int] = []
        for i, text in enumerate(texts):
            if not text.strip():
                result[i] = text
                continue
            cached = self._cache.get(self._key(text))
            if cached is not None:
                result[i] = cached
            else:
                todo.append(text)
                positions.append(i)
        if todo:
            translated = self._translate_many(todo)
            if len(translated) != len(todo):
                raise TranslationError(
                    f"{self.name}: expected {len(todo)} translations, "
                    f"got {len(translated)}")
            for pos, src, dst in zip(positions, todo, translated):
                result[pos] = dst
                self._cache[self._key(src)] = dst
            self._save_cache()
        return [r if r is not None else "" for r in result]

    # -- to be overridden ---------------------------------------------------
    def _translate_many(self, texts: list[str]) -> list[str]:
        out = []
        for text in texts:
            if self.max_chars and len(text) > self.max_chars:
                pieces = _split_long(text, self.max_chars)
                out.append(" ".join(self._translate_one(p) for p in pieces))
            else:
                out.append(self._translate_one(text))
        return out

    def _translate_one(self, text: str) -> str:
        raise NotImplementedError

    # -- helpers ------------------------------------------------------------
    def _key(self, text: str) -> str:
        digest = hashlib.sha1(text.encode("utf-8")).hexdigest()
        return f"{self.name}:{self.source}:{self.target}:{digest}"

    def _save_cache(self) -> None:
        if self._cache_path:
            try:
                self._cache_path.write_text(
                    json.dumps(self._cache, ensure_ascii=False, indent=0),
                    "utf-8")
            except Exception as exc:
                log.warning("cache: could not write %s (%s)", self._cache_path, exc)


class GoogleFreeTranslator(BaseTranslator):
    """Free Google web translation via deep-translator (no API key)."""

    name = "google"
    max_chars = 4500

    def __init__(self, source, target, cache_path=None):
        super().__init__(source, target, cache_path)
        try:
            from deep_translator import GoogleTranslator
        except ImportError as exc:
            raise TranslationError(
                "google provider needs deep-translator: pip install deep-translator"
            ) from exc
        self._impl = GoogleTranslator(source=source, target=target)

    def _translate_one(self, text: str) -> str:
        last: Exception | None = None
        for attempt in range(3):
            try:
                out = self._impl.translate(text)
                if out is None:
                    raise TranslationError("google returned empty result")
                return out
            except Exception as exc:  # network hiccups, throttling
                last = exc
                time.sleep(1.5 * (attempt + 1))
        raise TranslationError(
            f"google translation failed ({last}). Check internet access, or "
            "use --provider deepl/claude with an API key.") from last


class DeepLTranslator(BaseTranslator):
    """DeepL API (needs DEEPL_API_KEY or --deepl-key). Great de->uk quality."""

    name = "deepl"

    def __init__(self, source, target, cache_path=None, api_key=None):
        super().__init__(source, target, cache_path)
        key = api_key or os.environ.get("DEEPL_API_KEY")
        if not key:
            raise TranslationError(
                "deepl provider needs an API key: set DEEPL_API_KEY or pass --deepl-key")
        try:
            import deepl
        except ImportError as exc:
            raise TranslationError(
                "deepl provider needs the deepl package: pip install deepl") from exc
        self._impl = deepl.Translator(key)

    def _translate_many(self, texts: list[str]) -> list[str]:
        out: list[str] = []
        for i in range(0, len(texts), 40):
            chunk = texts[i:i + 40]
            res = self._impl.translate_text(
                chunk,
                source_lang=self.source.upper(),
                target_lang=self.target.upper(),
            )
            out.extend(r.text for r in res)
        return out


class ClaudeTranslator(BaseTranslator):
    """Claude API — best quality/terminology consistency (needs ANTHROPIC_API_KEY)."""

    name = "claude"
    _SEG = re.compile(r'<seg id="(\d+)">(.*?)</seg>', re.DOTALL)

    def __init__(self, source, target, cache_path=None, model="claude-opus-5"):
        super().__init__(source, target, cache_path)
        try:
            import anthropic
        except ImportError as exc:
            raise TranslationError(
                "claude provider needs the anthropic package: pip install anthropic"
            ) from exc
        self._anthropic = anthropic
        self._client = anthropic.Anthropic()
        self.model = model
        self._system = (
            f"You are a professional translator. Translate every segment from "
            f"{self.source} to {self.target}.\n"
            "The segments come from a PDF document and must keep their layout, so:\n"
            "- translate each segment independently; never merge, split, reorder "
            "or omit segments;\n"
            "- keep numbers, dates, codes, addresses, e-mails and proper names "
            "unchanged unless the target language requires transliteration;\n"
            "- keep punctuation style and capitalization patterns "
            "(ALL CAPS stays ALL CAPS);\n"
            "- prefer concise phrasing of similar length to the original;\n"
            '- reply ONLY with lines of the form <seg id="N">translation</seg>, '
            "one per input segment, same ids, nothing else."
        )

    def _translate_many(self, texts: list[str]) -> list[str]:
        result: dict[int, str] = {}
        batch: list[tuple[int, str]] = []
        batch_chars = 0
        for idx, text in enumerate(texts):
            batch.append((idx, text))
            batch_chars += len(text)
            if len(batch) >= 50 or batch_chars >= 8000:
                self._run_batch(batch, result)
                batch, batch_chars = [], 0
        if batch:
            self._run_batch(batch, result)
        return [result.get(i, texts[i]) for i in range(len(texts))]

    def _run_batch(self, batch: list[tuple[int, str]], result: dict[int, str]) -> None:
        payload = "\n".join(f'<seg id="{i}">{t}</seg>' for i, t in batch)
        text = self._request(payload)
        found = {int(sid): value.strip()
                 for sid, value in self._SEG.findall(text)}
        missing = [(i, t) for i, t in batch if i not in found]
        if missing and len(batch) > 1:
            # Retry stragglers one by one — never silently drop a segment.
            log.warning("claude: %d segment(s) missing from batch reply, retrying",
                        len(missing))
            for i, t in missing:
                self._run_batch([(i, t)], result)
            missing = []
        elif missing:
            single = text.strip()
            if single and "<seg" not in single:
                found[batch[0][0]] = single
                missing = []
        for i, t in batch:
            if i in found:
                result[i] = found[i]
        for i, t in missing:
            log.warning("claude: segment left untranslated: %.60s", t)
            result[i] = t

    def _request(self, payload: str) -> str:
        kwargs = dict(
            model=self.model,
            max_tokens=16000,
            system=self._system,
            messages=[{"role": "user", "content": payload}],
        )
        # Opt into server-side refusal fallbacks on models that support them.
        if self.model.startswith(("claude-opus-5", "claude-fable-5")):
            create = self._client.beta.messages.create
            kwargs["betas"] = ["server-side-fallback-2026-07-01"]
            kwargs["fallbacks"] = "default"
        else:
            create = self._client.messages.create
        try:
            response = create(**kwargs)
        except self._anthropic.AuthenticationError as exc:
            raise TranslationError(
                "claude provider: invalid or missing ANTHROPIC_API_KEY") from exc
        except self._anthropic.APIStatusError as exc:
            raise TranslationError(f"claude provider: API error {exc.status_code}: "
                                   f"{exc.message}") from exc
        except self._anthropic.APIConnectionError as exc:
            raise TranslationError(
                "claude provider: network error talking to the API") from exc
        if response.stop_reason == "refusal":
            detail = getattr(response, "stop_details", None)
            raise TranslationError(
                f"claude provider: request was refused "
                f"({getattr(detail, 'explanation', '') or 'no detail'})")
        if response.stop_reason == "max_tokens":
            raise TranslationError(
                "claude provider: reply hit max_tokens — re-run with a smaller "
                "batch (this should not happen with default settings)")
        return "".join(b.text for b in response.content if b.type == "text")


class LibreTranslator(BaseTranslator):
    """Self-hosted / public LibreTranslate instance."""

    name = "libre"
    max_chars = 4500

    def __init__(self, source, target, cache_path=None,
                 base_url="http://localhost:5000/", api_key=None):
        super().__init__(source, target, cache_path)
        try:
            from deep_translator import LibreTranslator as _Libre
        except ImportError as exc:
            raise TranslationError(
                "libre provider needs deep-translator: pip install deep-translator"
            ) from exc
        self._impl = _Libre(source=source, target=target,
                            base_url=base_url, api_key=api_key or "")

    def _translate_one(self, text: str) -> str:
        try:
            return self._impl.translate(text)
        except Exception as exc:
            raise TranslationError(f"libretranslate failed: {exc}") from exc


class MockTranslator(BaseTranslator):
    """Deterministic offline pseudo-translator (tests / --provider mock).

    Maps a few common German words to Ukrainian and transliterates the rest
    into Cyrillic, so the output exercises exactly the same rendering path
    as a real translation without needing network access.
    """

    name = "mock"

    _WORDS = {
        "mietvertrag": "договір оренди", "wohnraum": "житло",
        "vermieter": "орендодавець", "mieter": "орендар",
        "seite": "сторінка", "von": "з", "und": "і", "der": "цей",
        "die": "ця", "das": "це", "für": "для", "hinweis": "примітка",
        "wichtig": "важливо", "vertrag": "договір", "miete": "орендна плата",
    }
    _TRANSLIT = str.maketrans({
        "a": "а", "b": "б", "c": "ц", "d": "д", "e": "е", "f": "ф",
        "g": "ґ", "h": "г", "i": "і", "j": "й", "k": "к", "l": "л",
        "m": "м", "n": "н", "o": "о", "p": "п", "q": "к", "r": "р",
        "s": "с", "t": "т", "u": "у", "v": "в", "w": "в", "x": "кс",
        "y": "ї", "z": "з", "ä": "я", "ö": "є", "ü": "ю", "ß": "сс",
        "A": "А", "B": "Б", "C": "Ц", "D": "Д", "E": "Е", "F": "Ф",
        "G": "Ґ", "H": "Г", "I": "І", "J": "Й", "K": "К", "L": "Л",
        "M": "М", "N": "Н", "O": "О", "P": "П", "Q": "К", "R": "Р",
        "S": "С", "T": "Т", "U": "У", "V": "В", "W": "В", "X": "КС",
        "Y": "Ї", "Z": "З", "Ä": "Я", "Ö": "Є", "Ü": "Ю",
    })

    def _translate_one(self, text: str) -> str:
        def word(match: re.Match) -> str:
            w = match.group(0)
            hit = self._WORDS.get(w.lower())
            if hit:
                return hit.capitalize() if w[:1].isupper() else hit
            return w.translate(self._TRANSLIT)
        return re.sub(r"[^\W\d_]+", word, text, flags=re.UNICODE)


def get_provider(name: str, source: str, target: str, *,
                 cache_path: str | None = None, **kwargs) -> BaseTranslator:
    name = name.lower()
    if name == "google":
        return GoogleFreeTranslator(source, target, cache_path)
    if name == "deepl":
        return DeepLTranslator(source, target, cache_path,
                               api_key=kwargs.get("deepl_key"))
    if name == "claude":
        return ClaudeTranslator(source, target, cache_path,
                                model=kwargs.get("model") or "claude-opus-5")
    if name == "libre":
        return LibreTranslator(source, target, cache_path,
                               base_url=kwargs.get("libre_url")
                               or "http://localhost:5000/",
                               api_key=kwargs.get("libre_key"))
    if name == "mock":
        return MockTranslator(source, target, cache_path)
    raise TranslationError(f"unknown provider: {name!r} "
                           "(expected google, deepl, claude, libre or mock)")
