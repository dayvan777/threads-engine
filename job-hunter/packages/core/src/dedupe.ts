import { normalizeText, sha1 } from './util';

const TRACKING_PARAM =
  /^(utm_|ref$|ref_|referrer$|source$|src$|gh_src$|gh_jid$|lever-|origin$|fbclid$|gclid$|mc_cid$|mc_eid$|trk$|tracking|t$)/i;

/** Stable canonical form of a job URL: https, no www, no hash, tracking params removed, params sorted. */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAM.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length
      ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`
      : '';
    return `https://${host}${path}${qs}`;
  } catch {
    return raw.trim();
  }
}

export function locationBucket(location: string | null | undefined, remoteMode: string): string {
  if (remoteMode === 'remote') return 'remote';
  const first = String(location ?? '').split(/[,;|/]/)[0] ?? '';
  return normalizeText(first) || 'unknown';
}

export interface DedupeInput {
  company: string;
  title: string;
  location?: string | null;
  remoteMode: string;
}

/** Human-readable dedupe key: company | title | location bucket. */
export function dedupeKey(j: DedupeInput): string {
  return [normalizeText(j.company), normalizeText(j.title), locationBucket(j.location, j.remoteMode)].join('|');
}

export function dedupeHash(j: DedupeInput): string {
  return sha1(dedupeKey(j));
}
