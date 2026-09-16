import React, { useEffect, useState } from 'react';
import { api, refreshAll, useApi, type MasterProfile } from '../api';
import { IconPlus } from '../icons';
import {
  Button, Card, ChipEditor, ErrorNote, Field, Modal, SectionTitle, Select, Spinner, TextArea, TextInput, Toggle, cls,
} from '../ui';

type Answer = { id: number; question: string; answer: string };

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      {hint && <p className="mb-2 -mt-2 text-xs text-slate-400">{hint}</p>}
      <Card className="space-y-4 p-5">{children}</Card>
    </div>
  );
}

function ListEditor<T>({ items, onChange, empty, render, blank }: {
  items: T[];
  onChange: (v: T[]) => void;
  empty: string;
  blank: () => T;
  render: (item: T, set: (patch: Partial<T>) => void, remove: () => void, index: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 && <div className="text-sm text-slate-400">{empty}</div>}
      {items.map((item, i) => (
        <div key={i} className="relative rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <button
            className="absolute top-2 right-2 text-xs text-slate-400 hover:text-rose-600"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            remove
          </button>
          {render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), () => onChange(items.filter((_, j) => j !== i)), i)}
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...items, blank()])}>
        <IconPlus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}

function TriState({ value, onChange, labels }: { value: boolean | null; onChange: (v: boolean | null) => void; labels?: [string, string] }) {
  const [yes, no] = labels ?? ['Yes', 'No'];
  return (
    <Select value={value === null ? '' : value ? 'yes' : 'no'} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'yes')}>
      <option value="">not specified</option>
      <option value="yes">{yes}</option>
      <option value="no">{no}</option>
    </Select>
  );
}

export function ProfilePage() {
  const { data, error } = useApi<{ profile: MasterProfile; answers: Answer[] }>('/profile');
  const [p, setP] = useState<MasterProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [cvText, setCvText] = useState('');
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    if (data && !dirty) setP(data.profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (error) return <ErrorNote message={error} />;
  if (!p) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;

  const set = (patch: Partial<MasterProfile>): void => {
    setP({ ...p, ...patch });
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    try {
      await api('/profile', { method: 'PUT', json: p });
      setDirty(false);
      refreshAll();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const parseCv = async (): Promise<void> => {
    setParsing(true);
    try {
      const res = await api<{ draft: MasterProfile }>('/profile/parse-cv', { method: 'POST', json: { text: cvText } });
      setP(res.draft);
      setDirty(true);
      setImportOpen(false);
      setCvText('');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <p className="max-w-xl text-sm text-slate-500">
          The <b>Master Profile</b> is the single source of truth about you. The agent may only ever use facts from here —
          every generated CV and cover letter is verified against it.
        </p>
        <Button variant="ghost" onClick={() => setImportOpen(true)}>Import from CV text</Button>
      </div>
      {saveError && <ErrorNote message={saveError} />}

      <Section title="Contact & links">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Full name"><TextInput value={p.fullName} onChange={(e) => set({ fullName: e.target.value })} /></Field>
          <Field label="Headline"><TextInput value={p.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Operations Manager · AI enthusiast" /></Field>
          <Field label="Email"><TextInput value={p.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Phone"><TextInput value={p.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="Location"><TextInput value={p.location} onChange={(e) => set({ location: e.target.value })} placeholder="Berlin, Germany" /></Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="LinkedIn"><TextInput value={p.links.linkedin} onChange={(e) => set({ links: { ...p.links, linkedin: e.target.value } })} /></Field>
          <Field label="GitHub"><TextInput value={p.links.github} onChange={(e) => set({ links: { ...p.links, github: e.target.value } })} /></Field>
          <Field label="Portfolio"><TextInput value={p.links.portfolio} onChange={(e) => set({ links: { ...p.links, portfolio: e.target.value } })} /></Field>
        </div>
        <Field label="Professional summary">
          <TextArea rows={3} value={p.summary} onChange={(e) => set({ summary: e.target.value })} />
        </Field>
      </Section>

      <Section title="Work experience">
        <ListEditor
          items={p.workExperience}
          onChange={(v) => set({ workExperience: v })}
          empty="No experience entries yet."
          blank={() => ({ company: '', title: '', location: '', start: '', end: '', current: false, summary: '', highlights: [] })}
          render={(w, upd) => (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Job title"><TextInput value={w.title} onChange={(e) => upd({ title: e.target.value })} /></Field>
                <Field label="Company"><TextInput value={w.company} onChange={(e) => upd({ company: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="Start (YYYY-MM)"><TextInput value={w.start} onChange={(e) => upd({ start: e.target.value })} placeholder="2019-03" /></Field>
                <Field label="End"><TextInput value={w.end} onChange={(e) => upd({ end: e.target.value })} disabled={w.current} placeholder="2023-06" /></Field>
                <Field label="Location"><TextInput value={w.location} onChange={(e) => upd({ location: e.target.value })} /></Field>
                <div className="flex items-end pb-1.5"><Toggle checked={w.current} onChange={(v) => upd({ current: v, end: v ? '' : w.end })} label="current job" /></div>
              </div>
              <Field label="What you did"><TextArea rows={2} value={w.summary} onChange={(e) => upd({ summary: e.target.value })} /></Field>
              <Field label="Achievements / highlights (with your real numbers)">
                <ChipEditor values={w.highlights} onChange={(v) => upd({ highlights: v })} placeholder="Managed a team of 12…" />
              </Field>
            </div>
          )}
        />
      </Section>

      <Section title="Education">
        <ListEditor
          items={p.education}
          onChange={(v) => set({ education: v })}
          empty="No education entries yet."
          blank={() => ({ institution: '', degree: '', field: '', start: '', end: '', notes: '' })}
          render={(e2, upd) => (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Institution"><TextInput value={e2.institution} onChange={(e) => upd({ institution: e.target.value })} /></Field>
              <Field label="Degree"><TextInput value={e2.degree} onChange={(e) => upd({ degree: e.target.value })} placeholder="B.Sc." /></Field>
              <Field label="Field of study"><TextInput value={e2.field} onChange={(e) => upd({ field: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start"><TextInput value={e2.start} onChange={(e) => upd({ start: e.target.value })} placeholder="2012" /></Field>
                <Field label="End"><TextInput value={e2.end} onChange={(e) => upd({ end: e.target.value })} placeholder="2016" /></Field>
              </div>
            </div>
          )}
        />
      </Section>

      <Section title="Projects" hint="Own apps, AI projects, side projects — they matter for startup/AI roles.">
        <ListEditor
          items={p.projects}
          onChange={(v) => set({ projects: v })}
          empty="No projects yet."
          blank={() => ({ name: '', description: '', url: '', technologies: [] })}
          render={(pr, upd) => (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Name"><TextInput value={pr.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
                <Field label="URL"><TextInput value={pr.url} onChange={(e) => upd({ url: e.target.value })} /></Field>
              </div>
              <Field label="Description"><TextArea rows={2} value={pr.description} onChange={(e) => upd({ description: e.target.value })} /></Field>
              <Field label="Technologies"><ChipEditor values={pr.technologies} onChange={(v) => upd({ technologies: v })} /></Field>
            </div>
          )}
        />
      </Section>

      <Section title="Skills, languages & certifications">
        <Field label="Skills"><ChipEditor values={p.skills} onChange={(v) => set({ skills: v })} /></Field>
        <Field label="Languages (CEFR level or 'native')">
          <ListEditor
            items={p.languages}
            onChange={(v) => set({ languages: v })}
            empty="No languages yet."
            blank={() => ({ language: '', level: '' })}
            render={(l, upd) => (
              <div className="grid grid-cols-2 gap-3">
                <TextInput value={l.language} onChange={(e) => upd({ language: e.target.value })} placeholder="German" />
                <Select value={l.level} onChange={(e) => upd({ level: e.target.value })}>
                  <option value="">level…</option>
                  {['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'].map((x) => <option key={x} value={x}>{x}</option>)}
                </Select>
              </div>
            )}
          />
        </Field>
        <Field label="Certifications"><ChipEditor values={p.certifications} onChange={(v) => set({ certifications: v })} /></Field>
      </Section>

      <Section title="Application answers" hint="Used to answer screener questions on application forms — only truthful values, please.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Work authorization" hint='e.g. "EU citizen", "German residence permit with full work rights"'>
            <TextInput value={p.workAuthorization} onChange={(e) => set({ workAuthorization: e.target.value })} />
          </Field>
          <Field label="Need visa sponsorship?"><TriState value={p.needsVisaSponsorship} onChange={(v) => set({ needsVisaSponsorship: v })} /></Field>
          <Field label="Notice period"><TextInput value={p.noticePeriod} onChange={(e) => set({ noticePeriod: e.target.value })} placeholder="3 months" /></Field>
          <Field label="Earliest start date"><TextInput value={p.earliestStart} onChange={(e) => set({ earliestStart: e.target.value })} placeholder="2026-11-01" /></Field>
          <Field label="Salary expectation"><TextInput value={p.salaryExpectation} onChange={(e) => set({ salaryExpectation: e.target.value })} placeholder="55000 EUR" /></Field>
          <Field label="Willing to relocate?"><TriState value={p.willingToRelocate} onChange={(v) => set({ willingToRelocate: v })} /></Field>
        </div>
        <Field label="Extra facts the agent may use" hint="Any other true statements about you (one per chip).">
          <ChipEditor values={p.extraFacts} onChange={(v) => set({ extraFacts: v })} />
        </Field>
        {data && data.answers.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">Learned answers (from Needs-Input questions you answered)</div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {data.answers.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-600" title={a.question}>{a.question}</span>
                  <span className="max-w-40 truncate font-medium text-slate-800" title={a.answer}>{a.answer}</span>
                  <button className="text-xs text-slate-400 hover:text-rose-600" onClick={async () => { await api(`/profile/answers/${a.id}`, { method: 'DELETE' }); refreshAll(); }}>
                    delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <div className={cls('fixed right-0 bottom-0 left-52 z-30 border-t border-slate-200 bg-white/90 px-6 py-3 backdrop-blur transition-transform', dirty ? 'translate-y-0' : 'translate-y-full')}>
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-sm text-slate-500">You have unsaved profile changes.</span>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button>
        </div>
      </div>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import from CV text">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Paste the plain text of your CV. The AI extracts a structured profile draft <b>without inventing anything</b> —
            review it and press Save.
          </p>
          <TextArea rows={12} value={cvText} onChange={(e) => setCvText(e.target.value)} placeholder="Paste your CV text here…" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={parseCv} disabled={parsing || cvText.trim().length < 50}>{parsing ? 'Parsing…' : 'Parse CV'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
