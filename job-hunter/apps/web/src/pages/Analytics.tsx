import React from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useApi, type Analytics } from '../api';
import { Card, EmptyState, ErrorNote, SectionTitle, Spinner, StatCard } from '../ui';

const FUNNEL: Array<{ key: string; label: string }> = [
  { key: 'found', label: 'Jobs found' },
  { key: 'analyzed', label: 'Analyzed' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'submitted', label: 'Applied' },
  { key: 'response', label: 'Responses' },
  { key: 'interview', label: 'Interviews' },
  { key: 'offer', label: 'Offers' },
];

function BreakdownTable({ title, rows }: { title: string; rows: Analytics['breakdowns'][string] }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-xs font-semibold text-slate-500 uppercase">{title}</div>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">no submitted applications yet</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400">
              <th className="py-1 font-medium">Segment</th>
              <th className="py-1 text-right font-medium">Applied</th>
              <th className="py-1 text-right font-medium">Responses</th>
              <th className="py-1 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                <td className="max-w-40 truncate py-1.5 text-slate-700">{r.key}</td>
                <td className="py-1.5 text-right text-slate-600">{r.submitted}</td>
                <td className="py-1.5 text-right text-slate-600">{r.responses}</td>
                <td className="py-1.5 text-right font-medium text-slate-800">{r.responseRate !== null ? `${r.responseRate}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function AnalyticsPage() {
  const { data, error, loading } = useApi<Analytics>('/analytics', { refreshMs: 60_000 });
  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;
  if (error) return <ErrorNote message={error} />;
  if (!data) return null;
  const f = data.funnel;
  const max = Math.max(1, ...FUNNEL.map((s) => f[s.key] ?? 0));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Applications" value={f.submitted ?? 0} />
        <StatCard label="Responses" value={f.response ?? 0} sub={data.rates.responseRate !== null ? `${data.rates.responseRate}% response rate` : undefined} tone="indigo" />
        <StatCard label="Interviews" value={f.interview ?? 0} sub={data.rates.interviewRate !== null ? `${data.rates.interviewRate}% interview rate` : undefined} />
        <StatCard label="Offers" value={f.offer ?? 0} tone="green" sub={data.rates.offerRate !== null ? `${data.rates.offerRate}% offer rate` : undefined} />
      </div>

      <div>
        <SectionTitle>Funnel</SectionTitle>
        <Card className="space-y-2 p-4">
          {FUNNEL.map((s) => {
            const v = f[s.key] ?? 0;
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-right text-xs text-slate-500">{s.label}</div>
                <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
                  <div className="flex h-full items-center rounded bg-indigo-500/90 pl-2 text-[11px] font-semibold text-white transition-all"
                    style={{ width: `${Math.max(v > 0 ? 7 : 0, (v / max) * 100)}%` }}>
                    {v > 0 && v}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="pt-1 text-right text-xs text-slate-400">
            prefilter removed {f.prefilterSkipped ?? 0} · rejected {f.rejected ?? 0}
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Last 30 days</SectionTitle>
        <Card className="p-4">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.timeline} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(d: string) => d.slice(5)} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="found" name="jobs found" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="submitted" name="applied" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div>
        <SectionTitle>What works</SectionTitle>
        {data.insights.length === 0 ? (
          <Card><EmptyState title="No insights yet" /></Card>
        ) : (
          <div className="space-y-2">
            {data.insights.map((i, idx) => (
              <Card key={idx} className="border-l-4 border-l-indigo-400 px-4 py-3 text-sm text-slate-700">{i}</Card>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">
          Insights are suggestions only — the agent never changes your thresholds, salary minimum, locations or lists on its own.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BreakdownTable title="By source" rows={data.breakdowns.bySource ?? []} />
        <BreakdownTable title="By match score" rows={data.breakdowns.byScoreBucket ?? []} />
        <BreakdownTable title="By work mode" rows={data.breakdowns.byWorkMode ?? []} />
        <BreakdownTable title="By city" rows={data.breakdowns.byCity ?? []} />
      </div>
    </div>
  );
}
