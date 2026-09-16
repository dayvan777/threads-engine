import { createHash } from 'node:crypto';

export function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** UTC date part, used for "today" bucketing. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function stripDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** German job ads: "(m/w/d)", "(f/m/x)", "(all genders)" etc. */
const GENDER_SUFFIX = /\(\s*[mwfdxh](?:\s*\/\s*[mwfdxh]){1,3}\s*\*?\)/gi;

/**
 * Aggressive normalization for matching/deduplication:
 * lowercase, ASCII-fold, drop gender suffixes and punctuation, collapse spaces.
 */
export function normalizeText(s: string): string {
  return stripDiacritics(
    String(s ?? '')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(GENDER_SUFFIX, ' ')
      .replace(/\(all genders\)/gi, ' '),
  )
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'and', 'or', 'the', 'of', 'for', 'in', 'at', 'to', 'with',
  'und', 'oder', 'der', 'die', 'das', 'für', 'fur', 'mit', 'bei', 'im',
]);

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Phrase containment on normalized text; substring match for longer phrases (German compounds). */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const p = normalizeText(phrase);
  if (!p) return false;
  const h = ` ${normalizeText(haystack)} `;
  if (h.includes(` ${p} `)) return true;
  return p.length >= 6 && h.includes(p);
}

/** True when any meaningful token of `phrase` appears as a token of `text`. */
export function tokenOverlap(text: string, phrase: string): boolean {
  const tokens = new Set(tokenize(text));
  return tokenize(phrase).some((t) => t.length >= 3 && tokens.has(t));
}

/** Company vs. black/whitelist entry matching (inclusive both ways, guarded). */
export function matchesCompanyList(company: string, list: string[]): boolean {
  const nc = normalizeText(company);
  if (!nc) return false;
  return list.some((entry) => {
    const ne = normalizeText(entry);
    if (!ne || ne.length < 2) return false;
    return nc === ne || nc.includes(ne) || (nc.length >= 4 && ne.includes(nc));
  });
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', euro: '€', pound: '£', bull: '•',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
    try {
      if (code[0] === '#') {
        const hex = code[1] === 'x' || code[1] === 'X';
        const cp = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      return NAMED_ENTITIES[code] ?? m;
    } catch {
      return m;
    }
  });
}

/** Pragmatic HTML → plain text for job descriptions. */
export function htmlToText(html: string): string {
  let s = String(html ?? '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '\n- ');
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|ul|ol|blockquote|section)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n…[truncated]`;
}

export interface ParsedSalary {
  min?: number;
  max?: number;
  currency?: string;
}

/** Best-effort parse of a free-text yearly salary ("€50,000 – €70,000", "50k-70k EUR"). */
export function parseSalaryText(raw: string | undefined | null): ParsedSalary {
  if (!raw) return {};
  const text = String(raw);
  let currency: string | undefined;
  if (/€|EUR/i.test(text)) currency = 'EUR';
  else if (/\$|USD/i.test(text)) currency = 'USD';
  else if (/£|GBP/i.test(text)) currency = 'GBP';
  else if (/CHF/i.test(text)) currency = 'CHF';

  const num = (v: string, k: boolean): number => {
    const cleaned = v.replace(/[\s.,]/g, '');
    const n = parseInt(cleaned, 10);
    return k ? n * 1000 : n;
  };
  const yearly = (n: number): number | undefined => (n >= 10_000 && n <= 2_000_000 ? n : undefined);

  const NUM = '(\\d(?:[\\d.,\\s]*\\d)?)';
  const range = text.match(
    new RegExp(`${NUM}\\s*([kK])?\\s*(?:-|–|—|to|bis)\\s*(?:[€$£]\\s*)?${NUM}\\s*([kK])?`),
  );
  if (range) {
    const min = yearly(num(range[1]!, !!(range[2] || range[4])));
    const max = yearly(num(range[3]!, !!(range[4] || range[2])));
    if (min || max) return { min, max, currency };
  }
  const single = text.match(new RegExp(`${NUM}\\s*([kK])?`));
  if (single) {
    const v = yearly(num(single[1]!, !!single[2]));
    if (v) return { min: v, max: v, currency };
  }
  return { currency };
}

/** CEFR ordering; "native" outranks C2. */
const CEFR_ORDER: Record<string, number> = { a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6, native: 7, muttersprache: 7, fluent: 5 };

export function languageLevelRank(level: string): number {
  return CEFR_ORDER[normalizeText(level)] ?? 0;
}
