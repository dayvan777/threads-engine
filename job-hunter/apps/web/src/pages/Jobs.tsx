import React, { useEffect, useState } from 'react';
import { api, fmtDate, fmtSalary, refreshAll, useApi, type JobDetail, type JobItem } from '../api';
import { IconExternal, IconPlus } from '../icons';
import {
  Badge, Button, Card, Drawer, EmptyState, ErrorNote, Field, Modal, ScoreBadge, ScoreRing, Select, Spinner, Tabs, TextArea, TextInput, cls,
} from '../ui';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'found', label: 'New' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'analyzed', label: 'Analyzed' },
  { key: 'skipped_prefilter', label: 'Filtered out' },
  { key: 'archived', label: 'Archived' },
];

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ url: '', title: '', company: '', location: '', description: '', remoteMode: 'unknown' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/jobs/import', { method: 'POST', json: form });
      refreshAll();
      onClose();
      setForm({ url: '', title: '', company: '', location: '', description: '', remoteMode: 'unknown' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Import a job manually">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          For boards without an API (LinkedIn, StepStone, Indeed…): paste the link and description — the job flows through the same
          analyze → score → apply pipeline.
        </p>
        {error && <ErrorNote message={error} />}
        <Field label="Job URL *"><TextInput value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position *"><TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Company *"><TextInput value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location"><TextInput value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Berlin" /></Field>
          <Field label="Work mode">
            <Select value={form.remoteMode} onChange={(e) => setForm({ ...form, remoteMode: e.target.value })}>
              <option value="unknown">unknown</option><option value="remote">remote</option>
              <option value="hybrid">hybrid</option><option value="onsite">onsite</option>
            </Select>
          </Field>
        </div>
        <Field label="Job description (paste the full text)">
          <TextArea rows={7} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !form.url || !form.title || !form.company}>
            {busy ? 'Importing…' : 'Import & analyze'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function JobDrawer({ jobId, onClose }: { jobId: number | null; onClose: () => void }) {
  const { data, error, reload } = useApi<JobDetail>(jobId ? `/jobs/${jobId}` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (action: string, path: string): Promise<void> => {
    setBusy(action);
    try {
      await api(path, { method: 'POST', json: {} });
      refreshAll();
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const analysis = data?.analyses[0] ?? null;
  return (
    <Drawer open={jobId !== null} onClose={onClose} wide title={data ? `${data.job.title} · ${data.job.company}` : 'Loading…'}>
      {error && <ErrorNote message={error} />}
      {!data ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge>{data.job.sourceKind}</Badge>
            <Badge tone="sky">{data.job.remoteMode}</Badge>
            {data.job.location && <span>{data.job.location}</span>}
            <span>· {fmtSalary(data.job)}</span>
            <span>· discovered {fmtDate(data.job.discoveredAt)}</span>
            <a href={data.job.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-indigo-600 hover:underline">
              open posting <IconExternal className="h-3.5 w-3.5" />
            </a>
          </div>

          {data.job.skipReason && (
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">skip reason: {data.job.skipReason}</div>
          )}

          {analysis ? (
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <ScoreRing score={analysis.score} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold capitalize">{analysis.verdict.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-slate-400">{fmtDate(analysis.createdAt)} · {analysis.model}</span>
                  </div>
                  <p className="text-sm text-slate-700">{analysis.data.summary}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold text-emerald-700">Pros</div>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {analysis.data.pros.map((p, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-500">+</span>{p}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-rose-700">Cons</div>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {analysis.data.cons.map((c, i) => <li key={i} className="flex gap-1.5"><span className="text-rose-400">−</span>{c}</li>)}
                  </ul>
                </div>
              </div>
              {analysis.data.dealbreakers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {analysis.data.dealbreakers.map((d, i) => (
                    <Badge key={i} tone={d.severity === 'hard' ? 'red' : 'amber'}>{d.severity === 'hard' ? '⛔' : '⚠'} {d.detail}</Badge>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-4 text-sm text-slate-500">Not analyzed yet.</Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => act('analyze', `/jobs/${data.job.id}/analyze`)} disabled={busy !== null}>
              {busy === 'analyze' ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze now'}
            </Button>
            {!data.application && (
              <Button size="sm" onClick={() => act('queue', `/jobs/${data.job.id}/queue`)} disabled={busy !== null}>
                Create application
              </Button>
            )}
            {data.application && (
              <Badge tone="indigo">application #{data.application.id}: {data.application.status.replace(/_/g, ' ')}</Badge>
            )}
            <Button size="sm" variant="subtle" onClick={() => act('archive', `/jobs/${data.job.id}/archive`)} disabled={busy !== null}>
              Archive
            </Button>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500 uppercase">Description</div>
            <div className="rounded-lg bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-700">{data.job.description || '—'}</div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function JobsPage() {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [status, qDebounced]);

  const { data, error, loading } = useApi<{ items: JobItem[]; total: number; limit: number }>(
    `/jobs?status=${status}&q=${encodeURIComponent(qDebounced)}&page=${page}`,
    { refreshMs: 30_000 },
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={STATUS_TABS} active={status} onChange={setStatus} />
        <div className="flex items-center gap-2">
          <TextInput placeholder="Search title, company, city…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
          <Button onClick={() => setImportOpen(true)}><IconPlus className="h-4 w-4" /> Import job</Button>
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      <Card>
        {loading && !data ? (
          <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="No jobs here yet" hint="Run the agent (top right) or lower your filters. Sources are configured in Settings." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">Position</th>
                <th className="px-2 py-2.5 font-medium">Company</th>
                <th className="hidden px-2 py-2.5 font-medium lg:table-cell">Location</th>
                <th className="hidden px-2 py-2.5 font-medium md:table-cell">Salary</th>
                <th className="px-2 py-2.5 font-medium">Score</th>
                <th className="hidden px-2 py-2.5 font-medium lg:table-cell">Source</th>
                <th className="hidden px-2 py-2.5 font-medium md:table-cell">Found</th>
                <th className="px-4 py-2.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((j) => (
                <tr key={j.id} onClick={() => setSelected(j.id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="max-w-64 truncate px-4 py-2.5 font-medium text-slate-800">{j.title}</td>
                  <td className="max-w-40 truncate px-2 py-2.5 text-slate-600">{j.company}</td>
                  <td className="hidden max-w-36 truncate px-2 py-2.5 text-slate-500 lg:table-cell">
                    {j.remoteMode === 'remote' ? 'Remote' : (j.location ?? '—')}
                  </td>
                  <td className="hidden px-2 py-2.5 text-slate-500 md:table-cell">{fmtSalary(j)}</td>
                  <td className="px-2 py-2.5"><ScoreBadge score={j.score} /></td>
                  <td className="hidden px-2 py-2.5 text-xs text-slate-400 lg:table-cell">{j.sourceKind}</td>
                  <td className="hidden px-2 py-2.5 text-xs text-slate-400 md:table-cell">{fmtDate(j.discoveredAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {j.application ? (
                      <Badge tone="indigo">{j.application.status.replace(/_/g, ' ')}</Badge>
                    ) : (
                      <span className={cls('text-xs', j.status === 'skipped_prefilter' ? 'text-slate-400' : 'text-slate-500')}>
                        {j.status.replace(/_/g, ' ')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            <span>{data.total} jobs</span>
            <span className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</Button>
              page {page} / {pages}
              <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>→</Button>
            </span>
          </div>
        )}
      </Card>

      <JobDrawer jobId={selected} onClose={() => setSelected(null)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
