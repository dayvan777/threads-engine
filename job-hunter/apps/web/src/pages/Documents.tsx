import React, { useState } from 'react';
import { fmtDateTime, useApi, type DocumentMeta } from '../api';
import { md } from './Applications';
import { Badge, Card, Drawer, EmptyState, ErrorNote, Spinner, Tabs } from '../ui';

const KIND_TABS = [
  { key: 'all', label: 'All' },
  { key: 'cv_tailored', label: 'Tailored CVs' },
  { key: 'cover_letter', label: 'Cover letters' },
];

export function DocumentsPage() {
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState<number | null>(null);
  const { data, error, loading } = useApi<{ items: DocumentMeta[] }>(`/documents${kind !== 'all' ? `?kind=${kind}` : ''}`);
  const { data: detail } = useApi<{ document: DocumentMeta & { contentMd: string; meta: Record<string, unknown> | null } }>(
    selected ? `/documents/${selected}` : null,
  );

  return (
    <div className="space-y-4">
      <Tabs tabs={KIND_TABS} active={kind} onChange={setKind} />
      {error && <ErrorNote message={error} />}
      <Card>
        {loading && !data ? (
          <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="No documents yet" hint="Tailored CVs and cover letters appear here as the agent prepares applications." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((d) => (
              <li key={d.id} onClick={() => setSelected(d.id)} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <Badge tone={d.kind === 'cover_letter' ? 'violet' : 'indigo'}>{d.kind === 'cover_letter' ? 'letter' : 'CV'}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{d.title}</span>
                {d.hasPdf && (
                  <a href={`/api/documents/${d.id}/pdf`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-indigo-600 hover:underline">
                    PDF
                  </a>
                )}
                <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Drawer open={selected !== null} onClose={() => setSelected(null)} wide title={detail?.document.title ?? 'Loading…'}>
        {!detail ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <div className="space-y-3">
            {detail.document.meta && (detail.document.meta as { usedFallback?: boolean }).usedFallback && (
              <Badge tone="amber">fallback: master CV used (tailoring failed fact verification)</Badge>
            )}
            <div className="prose-doc" dangerouslySetInnerHTML={md(detail.document.contentMd)} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
