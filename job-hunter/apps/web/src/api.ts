import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobAnalysis, MasterProfile, Settings } from '@jobhunter/core/types';

export type { JobAnalysis, MasterProfile, Settings };

// ---------------------------------------------------------------------------
// API payload shapes (mirrors of the server responses)
// ---------------------------------------------------------------------------

export interface JobItem {
  id: number;
  sourceKind: string;
  url: string;
  title: string;
  company: string;
  location: string | null;
  remoteMode: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryRaw: string | null;
  descriptionPreview?: string;
  postedAt: string | null;
  discoveredAt: string;
  status: string;
  skipReason: string | null;
  score: number | null;
  verdict: string | null;
  application: { id: number; status: string } | null;
}

export interface JobDetail {
  job: JobItem & { description: string };
  analyses: Array<{ id: number; score: number; verdict: string; data: JobAnalysis; model: string; createdAt: string }>;
  application: { id: number; status: string } | null;
}

export interface JobSummary {
  id: number;
  title: string;
  company: string;
  location: string | null;
  remoteMode: string;
  url: string;
  sourceKind: string;
}

export interface ApplicationItem {
  id: number;
  jobId: number;
  status: string;
  intent: string;
  method: string | null;
  decision: { action: string; reason: string; score?: number } | null;
  submittedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  job: JobSummary | null;
  openQuestions: number;
}

export interface DocumentMeta {
  id: number;
  kind: string;
  jobId: number | null;
  applicationId: number | null;
  title: string;
  pdfPath: string | null;
  hasPdf?: boolean;
  sizeChars?: number;
  createdAt: string;
}

export interface ApplicationDetail {
  application: ApplicationItem & { answers: Record<string, string> | null; artifactsDir: string | null; cvDocumentId: number | null; coverLetterDocumentId: number | null };
  job: JobSummary | null;
  events: Array<{ id: number; type: string; message: string; createdAt: string }>;
  documents: Array<DocumentMeta & { contentMd: string }>;
  questions: QuestionItem[];
}

export interface QuestionItem {
  id: number;
  applicationId: number;
  question: string;
  fieldType: string | null;
  options: string[] | null;
  required: boolean;
  status: string;
  answer: string | null;
  createdAt: string;
  job?: JobSummary | null;
}

export interface ActivityItem {
  id: number;
  ts: string;
  actor: string;
  type: string;
  message: string;
  jobId: number | null;
  applicationId: number | null;
}

export interface AgentStatus {
  running: boolean;
  paused: boolean;
  lastCycleAt: string | null;
  nextCycleAt: string | null;
  cycleCount: number;
  llmConfigured: boolean;
  applyEnabled: boolean;
  autonomy?: string;
}

export interface Overview {
  today: { found: number; analyzed: number; applied: number; skipped: number; needsAttention: number };
  pipeline: { found: number; analyzed: number; qualified: number; applied: number; response: number; interview: number; offer: number; rejected: number };
  attention: Array<{ kind: string; applicationId: number; jobTitle: string; company: string; detail: string }>;
  activity: ActivityItem[];
  agent: AgentStatus;
}

export interface SourceItem {
  id: number;
  kind: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  lastScanAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

export interface Analytics {
  funnel: Record<string, number>;
  rates: { responseRate: number | null; interviewRate: number | null; offerRate: number | null };
  breakdowns: Record<string, Array<{ key: string; submitted: number; responses: number; interviews: number; responseRate: number | null }>>;
  timeline: Array<{ date: string; found: number; submitted: number }>;
  insights: string[];
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(body.error ?? `HTTP ${res.status}`), res.status);
  return body as T;
}

const bus = new EventTarget();

/** Signal every mounted useApi() hook to refetch (after a mutation). */
export function refreshAll(): void {
  bus.dispatchEvent(new Event('refresh'));
}

export function useApi<T>(
  path: string | null,
  opts: { refreshMs?: number } = {},
): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const seq = useRef(0);

  const load = useCallback(() => {
    if (path === null) return;
    const mySeq = ++seq.current;
    api<T>(path)
      .then((d) => {
        if (seq.current === mySeq) {
          setData(d);
          setError(null);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (seq.current === mySeq) {
          setError(e.message);
          setLoading(false);
        }
      });
  }, [path]);

  useEffect(() => {
    setLoading(path !== null);
    setData(null);
    load();
    const onRefresh = (): void => load();
    bus.addEventListener('refresh', onRefresh);
    let timer: ReturnType<typeof setInterval> | undefined;
    if (opts.refreshMs && path !== null) timer = setInterval(load, opts.refreshMs);
    return () => {
      bus.removeEventListener('refresh', onRefresh);
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, opts.refreshMs]);

  return { data, error, loading, reload: load };
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtSalary(j: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryRaw: string | null }): string {
  if (j.salaryMin || j.salaryMax) {
    const cur = j.salaryCurrency === 'EUR' ? '€' : j.salaryCurrency === 'USD' ? '$' : (j.salaryCurrency ?? '');
    const k = (n: number | null): string => (n ? `${Math.round(n / 1000)}k` : '?');
    return `${cur}${k(j.salaryMin)}–${k(j.salaryMax)}`;
  }
  return j.salaryRaw ? j.salaryRaw.slice(0, 20) : '—';
}
