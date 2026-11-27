/** Зіставлення одного товару між магазинами: спершу GTIN/EAN, потім номер моделі. */

export function normalizeGtin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  const padded = digits.padStart(14, "0");
  const body = padded.slice(0, 13);
  const check = Number(padded[13]);
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(body[i]) * (i % 2 === 0 ? 3 : 1);
  const expected = (10 - (sum % 10)) % 10;
  return expected === check ? padded : null;
}

export function normalizeModel(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw
    .toUpperCase()
    .replace(/[\s\-_./]+/g, "")
    .replace(/[^A-Z0-9А-ЯІЇЄҐ]/g, "");
  return s.length >= 3 ? s : null;
}

export interface Matchable {
  ean?: string | null;
  model?: string | null;
}

export type MatchKind = "gtin" | "model" | null;

export function matchKind(a: Matchable, b: Matchable): MatchKind {
  const ga = normalizeGtin(a.ean);
  const gb = normalizeGtin(b.ean);
  if (ga && gb) return ga === gb ? "gtin" : null;
  const ma = normalizeModel(a.model);
  const mb = normalizeModel(b.model);
  if (ma && mb && ma === mb) return "model";
  return null;
}

/** Що ввели в поле пошуку: посилання, EAN чи назву. */
export function classifyQuery(q: string):
  | { kind: "url"; host: string; url: string }
  | { kind: "ean"; gtin: string }
  | { kind: "text"; text: string } {
  const t = q.trim();
  try {
    const u = new URL(t.startsWith("http") ? t : "https://" + t);
    if (u.hostname.includes(".") && /[a-z]/i.test(u.hostname) && (t.startsWith("http") || t.includes("/"))) {
      return { kind: "url", host: u.hostname.replace(/^www\./, ""), url: u.toString() };
    }
  } catch {}
  const g = normalizeGtin(t);
  if (g && /^\d[\d\s-]*$/.test(t)) return { kind: "ean", gtin: g };
  return { kind: "text", text: t };
}
