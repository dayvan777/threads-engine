import React from 'react';
import { Link } from 'react-router-dom';
import { fmtDateTime, useApi, type Overview } from '../api';
import { Badge, Card, EmptyState, ErrorNote, SectionTitle, Spinner, StatCard, cls } from '../ui';

const FUNNEL_STAGES: Array<{ key: keyof Overview['pipeline']; label: string; color: string }> = [
  { key: 'found', label: 'Found', color: 'bg-slate-400' },
  { key: 'analyzed', label: 'Analyzed', color: 'bg-sky-500' },
  { key: 'qualified', label: 'Qualified', color: 'bg-indigo-500' },
  { key: 'applied', label: 'Applied', color: 'bg-violet-500' },
  { key: 'response', label: 'Response', color: 'bg-fuchsia-500' },
  { key: 'interview', label: 'Interview', color: 'bg-amber-500' },
  { key: 'offer', label: 'Offer', color: 'bg-emerald-500' },
];

export function DashboardPage() {
  const { data, error, loading } = useApi<Overview>('/overview', { refreshMs: 15_000 });
  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;

  const max = Math.max(1, ...FUNNEL_STAGES.map((s) => data.pipeline[s.key]));

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Today</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Jobs found" value={data.today.found} />
          <StatCard label="Analyzed" value={data.today.analyzed} />
          <StatCard label="Applications sent" value={data.today.applied} tone="indigo" />
          <StatCard label="Filtered out" value={data.today.skipped} />
          <StatCard label="Needs attention" value={data.today.needsAttention} tone={data.today.needsAttention > 0 ? 'amber' : undefined} />
        </div>
      </div>

      <div>
        <SectionTitle>Pipeline</SectionTitle>
        <Card className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {FUNNEL_STAGES.map((s) => {
              const v = data.pipeline[s.key];
              return (
                <div key={s.key} className="flex flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end justify-center rounded-md bg-slate-100">
                    <div
                      className={cls('w-3/5 rounded-t-md transition-all', s.color)}
                      style={{ height: `${Math.max(v > 0 ? 8 : 2, (v / max) * 100)}%` }}
                      title={`${s.label}: ${v}`}
                    />
                  </div>
                  <div className="text-sm font-bold text-slate-800">{v}</div>
                  <div className="text-[11px] text-slate-500">{s.label}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-right text-xs text-slate-400">rejected: {data.pipeline.rejected}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle
            right={
              data.attention.length > 0 ? (
                <Link to="/applications" className="text-xs font-medium text-indigo-600 hover:underline">
                  open Applications →
                </Link>
              ) : undefined
            }
          >
            Needs your attention
          </SectionTitle>
          <Card>
            {data.attention.length === 0 ? (
              <EmptyState title="Nothing needs you right now" hint="The agent will add items here when it needs a decision, an answer, or a manual submission." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.attention.map((a) => (
                  <li key={`${a.applicationId}-${a.kind}`} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">
                          {a.jobTitle} <span className="text-slate-400">· {a.company}</span>
                        </div>
                        <div className="truncate text-xs text-slate-500">{a.detail}</div>
                      </div>
                      <Badge tone={a.kind === 'ready_for_review' ? 'indigo' : 'amber'}>{a.kind.replace(/_/g, ' ')}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <SectionTitle
            right={
              <Link to="/activity" className="text-xs font-medium text-indigo-600 hover:underline">
                full log →
              </Link>
            }
          >
            Recent activity
          </SectionTitle>
          <Card>
            {data.activity.length === 0 ? (
              <EmptyState title="No activity yet" hint="Configure your profile and settings, then run the agent." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.activity.slice(0, 10).map((a) => (
                  <li key={a.id} className="flex items-baseline gap-3 px-4 py-2">
                    <span className="shrink-0 font-mono text-[11px] text-slate-400">{fmtDateTime(a.ts)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700" title={a.message}>
                      {a.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
