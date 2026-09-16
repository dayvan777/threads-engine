import React, { useEffect, useState } from 'react';
import { api, refreshAll, useApi, type Settings, type SourceItem } from '../api';
import {
  Badge, Button, Card, ChipEditor, ErrorNote, Field, SectionTitle, Select, Spinner, TextInput, Toggle, cls,
} from '../ui';

type SourceKindInfo = { kind: string; displayName: string; requiredConfig: string[] };

const AUTONOMY_OPTIONS: Array<{ value: Settings['autonomy']; title: string; desc: string }> = [
  { value: 'manual', title: 'Manual', desc: 'The agent only finds and analyzes jobs. No applications are created.' },
  { value: 'assisted', title: 'Assisted', desc: 'The agent prepares tailored documents; you approve every submission.' },
  { value: 'autonomous', title: 'Autonomous', desc: 'The agent submits qualifying applications on its own, within your thresholds and daily cap.' },
];

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      {hint && <p className="mb-2 -mt-2 text-xs text-slate-400">{hint}</p>}
      <Card className="space-y-4 p-5">{children}</Card>
    </div>
  );
}

function num(v: string): number | null {
  const n = Number(v);
  return v === '' || Number.isNaN(n) ? null : n;
}

function SourcesSection() {
  const { data, error, reload } = useApi<{ items: SourceItem[]; kinds: SourceKindInfo[] }>('/sources');
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState('greenhouse');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const kindInfo = data?.kinds.find((k) => k.kind === kind);

  const add = async (): Promise<void> => {
    try {
      await api('/sources', { method: 'POST', json: { kind, name, config } });
      setAdding(false);
      setConfig({});
      setName('');
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <Section
      title="Job sources"
      hint="Free public APIs — no keys needed. Add per-company Greenhouse/Lever boards for direct targeting; use manual import (Jobs page) for everything else."
    >
      {error && <ErrorNote message={error} />}
      {!data ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <Toggle
                checked={s.enabled}
                onChange={async (v) => {
                  await api(`/sources/${s.id}`, { method: 'PATCH', json: { enabled: v } });
                  reload();
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{s.name} <span className="text-xs text-slate-400">({s.kind})</span></div>
                <div className="truncate text-xs text-slate-400">
                  {s.lastError ? <span className="text-rose-600">{s.lastError}</span> : (s.lastStatus ?? 'never scanned')}
                  {s.lastScanAt && ` · ${new Date(s.lastScanAt).toLocaleString()}`}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={async () => {
                const res = await api<{ stats: { fetched: number; inserted: number } }>(`/sources/${s.id}/scan`, { method: 'POST', json: {} }).catch((e: Error) => { alert(e.message); return null; });
                if (res) alert(`Fetched ${res.stats.fetched} postings, ${res.stats.inserted} new.`);
                reload();
                refreshAll();
              }}>
                Scan now
              </Button>
              <button className="text-xs text-slate-400 hover:text-rose-600" onClick={async () => { await api(`/sources/${s.id}`, { method: 'DELETE' }); reload(); }}>
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source type">
              <Select value={kind} onChange={(e) => { setKind(e.target.value); setConfig({}); }}>
                {data?.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.displayName}</option>)}
              </Select>
            </Field>
            <Field label="Display name (optional)"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
          </div>
          {kindInfo?.requiredConfig.map((key) => (
            <Field key={key} label={`${key} *`} hint={key === 'board' ? 'the slug from boards.greenhouse.io/<slug>' : key === 'org' ? 'the slug from jobs.lever.co/<slug>' : undefined}>
              <TextInput value={config[key] ?? ''} onChange={(e) => setConfig({ ...config, [key]: e.target.value })} />
            </Field>
          ))}
          {(kind === 'greenhouse' || kind === 'lever') && (
            <Field label="companyName (optional)"><TextInput value={config.companyName ?? ''} onChange={(e) => setConfig({ ...config, companyName: e.target.value })} /></Field>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={add}>Add source</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>+ Add source</Button>
      )}
    </Section>
  );
}

export function SettingsPage() {
  const { data, error } = useApi<{ settings: Settings }>('/settings');
  const [s, setS] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !dirty) setS(data.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (error) return <ErrorNote message={error} />;
  if (!s) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;

  const set = (patch: Partial<Settings>): void => {
    setS({ ...s, ...patch });
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    try {
      const { paused, ...rest } = s; // paused is controlled by the Pause/Resume buttons only
      void paused;
      await api('/settings', { method: 'PUT', json: rest });
      setDirty(false);
      refreshAll();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {saveError && <ErrorNote message={saveError} />}

      <Section title="Autonomy" hint="How much the agent may do without you.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {AUTONOMY_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => set({ autonomy: o.value })}
              className={cls(
                'rounded-xl border p-4 text-left transition-colors',
                s.autonomy === o.value ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={cls('h-2.5 w-2.5 rounded-full', s.autonomy === o.value ? 'bg-indigo-600' : 'bg-slate-300')} />
                <span className="text-sm font-semibold">{o.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">{o.desc}</p>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Auto-apply threshold" hint="score ≥ this → apply automatically">
            <TextInput type="number" min={0} max={100} value={s.autoApplyThreshold} onChange={(e) => set({ autoApplyThreshold: Number(e.target.value) })} />
          </Field>
          <Field label="Review threshold" hint="score ≥ this → worth pursuing">
            <TextInput type="number" min={0} max={100} value={s.reviewThreshold} onChange={(e) => set({ reviewThreshold: Number(e.target.value) })} />
          </Field>
          <Field label="Max applications / day">
            <TextInput type="number" min={0} value={s.maxApplicationsPerDay} onChange={(e) => set({ maxApplicationsPerDay: Number(e.target.value) })} />
          </Field>
          <Field label="Max analyses / cycle" hint="LLM cost control">
            <TextInput type="number" min={1} value={s.maxAnalysesPerCycle} onChange={(e) => set({ maxAnalysesPerCycle: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <Toggle checked={s.coverLetterEnabled} onChange={(v) => set({ coverLetterEnabled: v })} label="generate cover letters" />
          <Toggle checked={s.strictKeywordGate} onChange={(v) => set({ strictKeywordGate: v })} label="skip jobs with zero keyword overlap (saves tokens)" />
        </div>
      </Section>

      <Section title="What you're looking for">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Desired job titles"><ChipEditor values={s.desiredTitles} onChange={(v) => set({ desiredTitles: v })} placeholder="Operations Manager…" /></Field>
          <Field label="Keywords"><ChipEditor values={s.keywords} onChange={(v) => set({ keywords: v })} placeholder="logistics, SaaS…" /></Field>
          <Field label="Excluded keywords" hint="jobs containing these are skipped"><ChipEditor values={s.excludedKeywords} onChange={(v) => set({ excludedKeywords: v })} /></Field>
          <Field label="Industries (preferred)"><ChipEditor values={s.industries} onChange={(v) => set({ industries: v })} /></Field>
          <Field label="Industries to avoid"><ChipEditor values={s.excludedIndustries} onChange={(v) => set({ excludedIndustries: v })} /></Field>
        </div>
      </Section>

      <Section title="Location & conditions">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Cities"><ChipEditor values={s.locations} onChange={(v) => set({ locations: v })} placeholder="Berlin…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Search radius (km)"><TextInput type="number" value={s.searchRadiusKm} onChange={(e) => set({ searchRadiusKm: Number(e.target.value) })} /></Field>
            <Field label="Max commute (min)"><TextInput type="number" value={s.commuteMaxMinutes ?? ''} onChange={(e) => set({ commuteMaxMinutes: num(e.target.value) })} /></Field>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <Field label="Work modes">
            <div className="flex gap-4 pt-1.5">
              {(['remote', 'hybrid', 'onsite'] as const).map((m) => (
                <Toggle
                  key={m}
                  checked={s.workModes.includes(m)}
                  onChange={(v) => set({ workModes: v ? [...s.workModes, m] : s.workModes.filter((x) => x !== m) })}
                  label={m}
                />
              ))}
            </div>
          </Field>
          <Field label="Minimum salary (yearly)">
            <div className="flex gap-2">
              <TextInput type="number" className="w-32" value={s.minSalary ?? ''} onChange={(e) => set({ minSalary: num(e.target.value) })} />
              <Select className="w-24" value={s.salaryCurrency} onChange={(e) => set({ salaryCurrency: e.target.value })}>
                {['EUR', 'USD', 'GBP', 'CHF'].map((c) => <option key={c}>{c}</option>)}
              </Select>
            </div>
          </Field>
          <Field label="Scan sources every (hours)">
            <TextInput type="number" className="w-24" min={1} value={s.scanIntervalHours} onChange={(e) => set({ scanIntervalHours: Number(e.target.value) })} />
          </Field>
        </div>
      </Section>

      <Section title="Companies">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Blacklist" hint="never apply to these companies">
            <ChipEditor values={s.blacklistCompanies} onChange={(v) => set({ blacklistCompanies: v })} />
          </Field>
          <Field label="Whitelist" hint="preferred — the review threshold drops by 10 for them">
            <ChipEditor values={s.whitelistCompanies} onChange={(v) => set({ whitelistCompanies: v })} />
          </Field>
        </div>
      </Section>

      <SourcesSection />

      <Section title="Safety notes">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>The API key lives only in <code className="rounded bg-slate-100 px-1">.env</code> — never in the database or this UI.</li>
          <li>Every agent action is written to the Activity log; every submission stores screenshots for audit.</li>
          <li>CAPTCHAs and bot checks are never bypassed — such applications become <Badge tone="amber">needs action</Badge> for you.</li>
          <li>Generated documents are machine-verified against your Master Profile: no invented facts can be submitted.</li>
          <li>The Pause button (top right) stops the agent within seconds, mid-cycle.</li>
        </ul>
      </Section>

      <div className={cls('fixed right-0 bottom-0 left-52 z-30 border-t border-slate-200 bg-white/90 px-6 py-3 backdrop-blur transition-transform', dirty ? 'translate-y-0' : 'translate-y-full')}>
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-sm text-slate-500">You have unsaved settings changes.</span>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
        </div>
      </div>
    </div>
  );
}
