import DOMPurify from 'dompurify';
import { marked } from 'marked';
import React, { useState } from 'react';
import {
  api, fmtDateTime, refreshAll, useApi, type ApplicationDetail, type ApplicationItem, type QuestionItem,
} from '../api';
import { IconExternal } from '../icons';
import {
  Badge, Button, Card, Drawer, EmptyState, ErrorNote, Field, KV, ScoreBadge, Spinner, StatusBadge, TextInput, Toggle, cls,
} from '../ui';

const GROUPS: Array<{ title: string; statuses: string[]; hint?: string }> = [
  { title: 'Needs you', statuses: ['needs_input', 'needs_action', 'ready_for_review', 'failed'], hint: 'items waiting for a decision, an answer, or a manual step' },
  { title: 'Agent working', statuses: ['queued', 'preparing', 'approved', 'applying'] },
  { title: 'Submitted', statuses: ['submitted', 'response', 'interview'] },
  { title: 'Closed', statuses: ['offer', 'rejected', 'withdrawn', 'discarded'] },
];

export function md(html: string): { __html: string } {
  return { __html: DOMPurify.sanitize(marked.parse(html, { async: false }) as string) };
}

function QuestionRow({ q, onDone }: { q: QuestionItem; onDone: () => void }) {
  const [answer, setAnswer] = useState(q.answer ?? '');
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  if (q.status !== 'open') {
    return (
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <div className="text-slate-600">{q.question}</div>
        <div className="mt-0.5 text-xs text-slate-400">{q.status === 'answered' ? `answered: ${q.answer}` : 'dismissed'}</div>
      </div>
    );
  }
  const submit = async (): Promise<void> => {
    setBusy(true);
    try {
      await api(`/questions/${q.id}/answer`, { method: 'POST', json: { answer, saveToProfile: save } });
      refreshAll();
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <div className="text-sm font-medium text-slate-800">{q.question}</div>
      {q.options && q.options.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {q.options.map((o) => (
            <button key={o} onClick={() => setAnswer(o)} className={cls('rounded-full border px-2 py-0.5 text-xs', answer === o ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400')}>
              {o}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <TextInput value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="your answer…" />
        <Button size="sm" onClick={submit} disabled={busy || !answer.trim()}>{busy ? '…' : 'Answer'}</Button>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <Toggle checked={save} onChange={setSave} label="remember for future applications" />
        <button
          className="text-xs text-slate-400 hover:text-rose-600"
          onClick={async () => {
            await api(`/questions/${q.id}/dismiss`, { method: 'POST', json: {} });
            refreshAll();
            onDone();
          }}
        >
          dismiss
        </button>
      </div>
    </div>
  );
}

function AppDrawer({ appId, onClose }: { appId: number | null; onClose: () => void }) {
  const { data, error, reload } = useApi<ApplicationDetail>(appId ? `/applications/${appId}` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [docTab, setDocTab] = useState<'cv' | 'letter'>('cv');

  const act = async (name: string, path: string, json: unknown = {}): Promise<void> => {
    setBusy(name);
    try {
      await api(path, { method: 'POST', json });
      refreshAll();
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const a = data?.application;
  const cv = data?.documents.find((d) => d.kind === 'cv_tailored') ?? data?.documents.find((d) => d.kind === 'cv_master');
  const letter = data?.documents.find((d) => d.kind === 'cover_letter');
  const doc = docTab === 'cv' ? cv : letter;
  const openQuestions = data?.questions.filter((q) => q.status === 'open') ?? [];

  return (
    <Drawer open={appId !== null} onClose={onClose} wide title={data?.job ? `${data.job.title} · ${data.job.company}` : 'Loading…'}>
      {error && <ErrorNote message={error} />}
      {!data || !a ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} />
            {a.decision?.score !== undefined && <ScoreBadge score={a.decision.score ?? null} />}
            <Badge>{a.intent === 'auto_apply' ? 'auto' : 'review'}</Badge>
            {a.method && <Badge tone="sky">{a.method.replace('auto_', '')}</Badge>}
            {data.job && (
              <a href={data.job.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
                job posting <IconExternal className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {a.decision && <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">decision: {a.decision.reason}</div>}
          {a.failureReason && <ErrorNote message={a.failureReason} />}

          {/* Contextual actions */}
          <div className="flex flex-wrap gap-2">
            {['ready_for_review', 'needs_action', 'failed'].includes(a.status) && (
              <Button size="sm" onClick={() => act('approve', `/applications/${a.id}/approve`)} disabled={busy !== null || openQuestions.length > 0}
                title={openQuestions.length > 0 ? 'answer the open questions first' : undefined}>
                {busy === 'approve' ? 'Submitting…' : a.status === 'ready_for_review' ? 'Approve & submit' : 'Retry submission'}
              </Button>
            )}
            {['ready_for_review', 'needs_action', 'failed', 'queued'].includes(a.status) && (
              <Button size="sm" variant="ghost" onClick={() => act('reprepare', `/applications/${a.id}/reprepare`)} disabled={busy !== null}>
                Regenerate documents
              </Button>
            )}
            {['needs_action', 'ready_for_review', 'failed'].includes(a.status) && (
              <Button size="sm" variant="ghost" onClick={() => act('manual', `/applications/${a.id}/status`, { status: 'submitted', note: 'submitted manually by the user' })} disabled={busy !== null}>
                Mark submitted manually
              </Button>
            )}
            {a.status === 'submitted' && (
              <>
                <Button size="sm" variant="ghost" onClick={() => act('response', `/applications/${a.id}/status`, { status: 'response' })}>Got response</Button>
                <Button size="sm" variant="ghost" onClick={() => act('rejected', `/applications/${a.id}/status`, { status: 'rejected' })}>Rejected</Button>
              </>
            )}
            {['response', 'interview'].includes(a.status) && (
              <>
                {a.status === 'response' && <Button size="sm" variant="ghost" onClick={() => act('interview', `/applications/${a.id}/status`, { status: 'interview' })}>Interview scheduled</Button>}
                <Button size="sm" variant="ghost" onClick={() => act('offer', `/applications/${a.id}/status`, { status: 'offer' })}>Offer 🎉</Button>
                <Button size="sm" variant="ghost" onClick={() => act('rejected2', `/applications/${a.id}/status`, { status: 'rejected' })}>Rejected</Button>
              </>
            )}
            {!['discarded', 'offer', 'rejected', 'withdrawn'].includes(a.status) && (
              <Button size="sm" variant="danger" onClick={() => act('discard', `/applications/${a.id}/discard`)} disabled={busy !== null}>
                Discard
              </Button>
            )}
          </div>

          {/* Open questions (Needs Input) */}
          {data.questions.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-500 uppercase">Questions from the application form</div>
              <div className="space-y-2">
                {data.questions.map((q) => <QuestionRow key={q.id} q={q} onDone={reload} />)}
              </div>
            </div>
          )}

          {/* Documents */}
          {(cv || letter) && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <div className="text-xs font-semibold text-slate-500 uppercase">Documents</div>
                <div className="flex gap-1">
                  {cv && (
                    <button onClick={() => setDocTab('cv')} className={cls('rounded px-2 py-0.5 text-xs', docTab === 'cv' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100')}>CV</button>
                  )}
                  {letter && (
                    <button onClick={() => setDocTab('letter')} className={cls('rounded px-2 py-0.5 text-xs', docTab === 'letter' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100')}>Cover letter</button>
                  )}
                </div>
                {doc && (
                  <a className="ml-auto text-xs text-indigo-600 hover:underline" href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer">
                    open PDF
                  </a>
                )}
              </div>
              {doc ? (
                <Card className="scroll-thin max-h-96 overflow-y-auto p-5">
                  <div className="prose-doc" dangerouslySetInnerHTML={md(doc.contentMd)} />
                </Card>
              ) : (
                <Card className="p-4 text-sm text-slate-500">not generated</Card>
              )}
            </div>
          )}

          {/* Timeline */}
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500 uppercase">Timeline</div>
            <ul className="space-y-1.5">
              {data.events.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 text-sm">
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">{fmtDateTime(e.createdAt)}</span>
                  <span className="text-slate-700">{e.message}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <KV k="Created" v={fmtDateTime(a.createdAt)} />
            <KV k="Submitted" v={fmtDateTime(a.submittedAt)} />
            {a.answers && Object.keys(a.answers).length > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-xs font-semibold text-slate-500 uppercase">Answers given on the form</div>
                {Object.entries(a.answers).map(([k, v]) => <KV key={k} k={k} v={v} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function ApplicationsPage() {
  const { data, error, loading } = useApi<{ items: ApplicationItem[] }>('/applications', { refreshMs: 15_000 });
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {error && <ErrorNote message={error} />}
      {loading && !data && <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>}
      {data && data.items.length === 0 && (
        <Card>
          <EmptyState title="No applications yet" hint="Once jobs qualify above your review threshold, the agent creates applications here (or fully submits them in autonomous mode)." />
        </Card>
      )}
      {data &&
        GROUPS.map((g) => {
          const items = data.items.filter((a) => g.statuses.includes(a.status));
          if (items.length === 0) return null;
          return (
            <div key={g.title}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold tracking-wide text-slate-600 uppercase">{g.title}</h2>
                <span className="text-xs text-slate-400">{items.length}{g.hint ? ` — ${g.hint}` : ''}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((a) => (
                  <Card key={a.id} className="cursor-pointer p-4 transition-shadow hover:shadow-md" >
                    <div onClick={() => setSelected(a.id)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">{a.job?.title ?? '?'}</div>
                          <div className="truncate text-xs text-slate-500">{a.job?.company}</div>
                        </div>
                        <ScoreBadge score={a.decision?.score ?? null} />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <StatusBadge status={a.status} />
                        <span className="text-[11px] text-slate-400">{fmtDateTime(a.updatedAt)}</span>
                      </div>
                      {a.openQuestions > 0 && (
                        <div className="mt-2 text-xs font-medium text-amber-600">{a.openQuestions} question(s) waiting for you</div>
                      )}
                      {a.failureReason && <div className="mt-2 truncate text-xs text-rose-600" title={a.failureReason}>{a.failureReason}</div>}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      <AppDrawer appId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
