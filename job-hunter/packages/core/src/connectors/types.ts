import type { NormalizedJob } from '../types';

export type SourceKind = 'arbeitnow' | 'remoteok' | 'remotive' | 'greenhouse' | 'lever' | 'manual';

export interface ConnectorContext {
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

export interface Connector {
  kind: SourceKind;
  displayName: string;
  /** Config keys the user must provide when adding a source of this kind. */
  requiredConfig: string[];
  fetchJobs(config: Record<string, unknown>, ctx?: ConnectorContext): Promise<NormalizedJob[]>;
}

const USER_AGENT = 'jobhunter-agent/0.1 (personal job-search assistant)';

export async function getJson<T>(url: string, ctx?: ConnectorContext): Promise<T> {
  const fetchImpl = ctx?.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
