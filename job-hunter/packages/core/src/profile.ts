import type { MasterProfile } from './types';
import { normalizeText } from './util';

export function profileCompanies(p: MasterProfile): string[] {
  return p.workExperience.map((w) => w.company).filter(Boolean);
}

export function profileTitles(p: MasterProfile): string[] {
  return p.workExperience.map((w) => w.title).filter(Boolean);
}

export function profileInstitutions(p: MasterProfile): string[] {
  return p.education.map((e) => e.institution).filter(Boolean);
}

export function profileDegrees(p: MasterProfile): string[] {
  return p.education.map((e) => [e.degree, e.field].filter(Boolean).join(' ')).filter(Boolean);
}

function parseYearMonth(s: string): Date | null {
  const m = String(s ?? '').match(/(\d{4})(?:[-/.](\d{1,2}))?/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) - 1 : 0;
  if (year < 1950 || year > 2100) return null;
  return new Date(Date.UTC(year, month, 1));
}

/** Total career span in years (first start → last end/now), capped per-entry sum fallback. */
export function careerYears(p: MasterProfile): number {
  let ms = 0;
  for (const w of p.workExperience) {
    const start = parseYearMonth(w.start);
    if (!start) continue;
    const end = w.current || !w.end ? new Date() : (parseYearMonth(w.end) ?? new Date());
    if (end.getTime() > start.getTime()) ms += end.getTime() - start.getTime();
  }
  return ms / (365.25 * 24 * 3600 * 1000);
}

/** Normalized corpus of every fact in the profile (used by the fact-guard number check). */
export function factCorpus(p: MasterProfile): string {
  return normalizeText(JSON.stringify(p));
}

function fmtRange(start: string, end: string, current: boolean): string {
  const e = current || !end ? 'Present' : end;
  return [start, e].filter(Boolean).join(' – ');
}

/**
 * Deterministic Master CV renderer. This exact structure is the template
 * contract for LLM-tailored CVs (the fact-guard parses it back), and the
 * safe fallback when tailoring fails validation.
 */
export function renderMasterCvMd(p: MasterProfile): string {
  const lines: string[] = [];
  lines.push(`# ${p.fullName || 'Unnamed Candidate'}`);
  if (p.headline) lines.push('', p.headline);
  const contact = [p.location, p.email, p.phone].filter(Boolean).join(' · ');
  if (contact) lines.push('', contact);
  const links = [
    p.links.linkedin && `[LinkedIn](${p.links.linkedin})`,
    p.links.github && `[GitHub](${p.links.github})`,
    p.links.portfolio && `[Portfolio](${p.links.portfolio})`,
    ...p.links.other.map((l) => `[${l.label}](${l.url})`),
  ].filter(Boolean);
  if (links.length) lines.push('', links.join(' · '));

  if (p.summary) lines.push('', '## Summary', '', p.summary);

  if (p.workExperience.length) {
    lines.push('', '## Experience');
    for (const w of p.workExperience) {
      lines.push('', `### ${w.title} — ${w.company}`);
      const meta = [fmtRange(w.start, w.end, w.current), w.location].filter(Boolean).join(' · ');
      if (meta) lines.push(`*${meta}*`);
      if (w.summary) lines.push('', w.summary);
      for (const h of w.highlights) lines.push(`- ${h}`);
    }
  }

  if (p.projects.length) {
    lines.push('', '## Projects');
    for (const pr of p.projects) {
      lines.push('', `### ${pr.name}`);
      if (pr.description) lines.push('', pr.description);
      if (pr.technologies.length) lines.push(`*Technologies: ${pr.technologies.join(', ')}*`);
      if (pr.url) lines.push(`[${pr.url}](${pr.url})`);
    }
  }

  if (p.education.length) {
    lines.push('', '## Education');
    for (const e of p.education) {
      const degree = [e.degree, e.field].filter(Boolean).join(', ');
      lines.push('', `### ${degree ? `${degree} — ` : ''}${e.institution}`);
      const meta = fmtRange(e.start, e.end, false);
      if (meta) lines.push(`*${meta}*`);
      if (e.notes) lines.push('', e.notes);
    }
  }

  if (p.skills.length) lines.push('', '## Skills', '', p.skills.join(' · '));

  if (p.languages.length) {
    lines.push('', '## Languages', '');
    for (const l of p.languages) lines.push(`- ${l.language} — ${l.level}`);
  }

  if (p.certifications.length) {
    lines.push('', '## Certifications', '');
    for (const c of p.certifications) lines.push(`- ${c}`);
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
