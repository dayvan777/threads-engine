import React, { useState } from 'react';
import { useApi, type ActivityItem } from '../api';
import { Badge, Card, EmptyState, ErrorNote, Spinner, Tabs, cls } from '../ui';

const TYPE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'scan', label: 'Scanning' },
  { key: 'analyze', label: 'Analysis' },
  { key: 'decide', label: 'Decisions' },
  { key: 'prepare', label: 'Documents' },
  { key: 'apply', label: 'Applications' },
];

const ERROR_TYPES = new Set(['scan_error', 'analyze_error', 'prepare_error', 'apply_error', 'error']);

export function ActivityPage() {
  const [type, setType] = useState('all');
  const { data, error, loading } = useApi<{ items: ActivityItem[] }>(
    `/activity?limit=150${type !== 'all' ? `&type=${type}` : ''}`,
    { refreshMs: 10_000 },
  );

  return (
    <div className="space-y-4">
      <Tabs tabs={TYPE_TABS} active={type} onChange={setType} />
      {error && <ErrorNote message={error} />}
      <Card>
        {loading && !data ? (
          <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="Nothing logged yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((a) => {
              const t = new Date(a.ts);
              return (
                <li key={a.id} className="flex items-baseline gap-3 px-4 py-2">
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">
                    {t.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}{' '}
                    {t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <Badge tone={ERROR_TYPES.has(a.type) ? 'red' : a.actor === 'user' ? 'sky' : 'slate'} className="shrink-0">
                    {a.type}
                  </Badge>
                  <span className={cls('min-w-0 flex-1 text-sm', ERROR_TYPES.has(a.type) ? 'text-rose-700' : 'text-slate-700')}>
                    {a.message}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
