import {
  careerYears,
  factCorpus,
  profileCompanies,
  profileDegrees,
  profileInstitutions,
  profileTitles,
} from '../profile';
import type { FactGuardReport, FactViolation, MasterProfile } from '../types';
import { languageLevelRank, normalizeText, tokenize } from '../util';

export type DocMode = 'cv' | 'letter';

const LANGUAGE_ALIASES: Record<string, string[]> = {
  english: ['english', 'englisch'],
  german: ['german', 'deutsch'],
  french: ['french', 'franzosisch'],
  spanish: ['spanish', 'spanisch'],
  italian: ['italian', 'italienisch'],
  russian: ['russian', 'russisch'],
  ukrainian: ['ukrainian', 'ukrainisch'],
  polish: ['polish', 'polnisch'],
  portuguese: ['portuguese', 'portugiesisch'],
  dutch: ['dutch', 'niederlandisch'],
  chinese: ['chinese', 'chinesisch', 'mandarin'],
  japanese: ['japanese', 'japanisch'],
  arabic: ['arabic', 'arabisch'],
  turkish: ['turkish', 'turkisch'],
};

function fuzzyEquals(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function fuzzyIn(value: string, list: string[]): boolean {
  return list.some((item) => fuzzyEquals(value, item));
}

function splitHeading(heading: string): { left: string; right: string | null } {
  for (const sep of [' — ', ' – ', ' - ']) {
    const idx = heading.lastIndexOf(sep);
    if (idx > 0) return { left: heading.slice(0, idx).trim(), right: heading.slice(idx + sep.length).trim() };
  }
  return { left: heading.trim(), right: null };
}

function splitSections(md: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = md.split(/^## +/m);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const name = normalizeText(nl === -1 ? part : part.slice(0, nl));
    sections[name] = nl === -1 ? '' : part.slice(nl + 1);
  }
  return sections;
}

function digitRuns(s: string): string[] {
  return [...String(s).matchAll(/\d[\d.,]*\d|\d/g)].map((m) => m[0].replace(/[.,]/g, ''));
}

/** Verifies (language, CEFR level) claims line-by-line against the profile. */
function checkLanguageClaims(profile: MasterProfile, text: string, violations: FactViolation[]): void {
  const profileLevels = new Map<string, number>();
  for (const l of profile.languages) {
    const norm = normalizeText(l.language);
    for (const [canon, aliases] of Object.entries(LANGUAGE_ALIASES)) {
      if (aliases.some((a) => norm.includes(a))) {
        profileLevels.set(canon, Math.max(profileLevels.get(canon) ?? 0, languageLevelRank(l.level)));
      }
    }
  }
  for (const line of text.split('\n')) {
    const cefrs = [...line.matchAll(/\b([ABC][12])\b/g)];
    if (cefrs.length === 0) continue;
    const normLine = normalizeText(line);
    for (const [canon, aliases] of Object.entries(LANGUAGE_ALIASES)) {
      if (!aliases.some((a) => ` ${normLine} `.includes(` ${a} `))) continue;
      const claimedRank = Math.max(...cefrs.map((m) => languageLevelRank(m[1]!)));
      const have = profileLevels.get(canon);
      if (have === undefined) {
        violations.push({ type: 'unknown_language', detail: `claims ${canon.toUpperCase()} level not present in profile: "${line.trim()}"` });
      } else if (claimedRank > have) {
        violations.push({ type: 'inflated_language_level', detail: `claims a higher ${canon} level than the profile: "${line.trim()}"` });
      }
    }
  }
}

/** Every number in the document must be traceable to the profile (durations vs. career length excepted). */
function checkNumbers(profile: MasterProfile, text: string, violations: FactViolation[]): void {
  const allowed = new Set(digitRuns(JSON.stringify(profile)));
  const year = new Date().getFullYear();
  for (const y of [year - 1, year, year + 1]) allowed.add(String(y));
  const maxCareer = Math.ceil(careerYears(profile)) + 1;
  const seen = new Set<string>();
  for (const m of text.matchAll(/\d[\d.,]*\d|\d/g)) {
    const run = m[0].replace(/[.,]/g, '');
    if (allowed.has(run) || seen.has(run)) continue;
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 14);
    if (/^\s*\+?\s*(years?|yrs?|jahren?|jahre)/i.test(after) && Number(run) <= maxCareer) continue;
    seen.add(run);
    const start = Math.max(0, (m.index ?? 0) - 30);
    const context = text.slice(start, (m.index ?? 0) + m[0].length + 30).replace(/\s+/g, ' ').trim();
    violations.push({ type: 'unsupported_number', detail: `"${m[0]}" is not backed by profile facts (…${context}…)` });
  }
}

/** Structural check for CVs following the template contract (### Title — Company etc.). */
function checkCvStructure(profile: MasterProfile, md: string, violations: FactViolation[]): void {
  const sections = splitSections(md);
  const expBody = sections['experience'] ?? sections['work experience'] ?? sections['berufserfahrung'];

  if (profile.workExperience.length > 0 && expBody === undefined) {
    violations.push({ type: 'template_mismatch', detail: 'missing "## Experience" section' });
  }
  if (expBody !== undefined) {
    const titles = profileTitles(profile);
    const companies = profileCompanies(profile);
    for (const m of expBody.matchAll(/^### +(.+)$/gm)) {
      const { left, right } = splitHeading(m[1]!);
      if (right === null) {
        violations.push({ type: 'template_mismatch', detail: `experience entry not "Title — Company": "${m[1]}"` });
        continue;
      }
      if (!fuzzyIn(right, companies)) {
        violations.push({ type: 'unknown_employer', detail: `employer "${right}" is not in the profile` });
      }
      if (!fuzzyIn(left, titles)) {
        violations.push({ type: 'unknown_job_title', detail: `job title "${left}" is not in the profile` });
      }
    }
  }

  const eduBody = sections['education'] ?? sections['ausbildung'];
  if (eduBody !== undefined) {
    const institutions = profileInstitutions(profile);
    const degreeTokens = new Set(profileDegrees(profile).flatMap((d) => tokenize(d)));
    for (const m of eduBody.matchAll(/^### +(.+)$/gm)) {
      const { left, right } = splitHeading(m[1]!);
      const institution = right ?? left;
      if (!fuzzyIn(institution, institutions)) {
        violations.push({ type: 'unknown_institution', detail: `institution "${institution}" is not in the profile` });
      }
      if (right !== null && degreeTokens.size > 0) {
        const overlap = tokenize(left).some((t) => degreeTokens.has(t));
        if (!overlap) {
          violations.push({ type: 'unknown_degree', detail: `degree "${left}" does not match the profile` });
        }
      }
    }
  }

  const certBody = sections['certifications'] ?? sections['zertifikate'];
  if (certBody !== undefined) {
    for (const m of certBody.matchAll(/^- +(.+)$/gm)) {
      if (!fuzzyIn(m[1]!, profile.certifications)) {
        violations.push({ type: 'unknown_certification', detail: `certification "${m[1]}" is not in the profile` });
      }
    }
  }
}

/**
 * Deterministic no-fabrication validator for generated documents.
 * It cannot prove every sentence true, but it hard-blocks the classic
 * fabrications: unknown employers/titles/institutions/degrees/certs,
 * inflated language levels, and numbers with no source in the profile.
 */
export function factGuard(profile: MasterProfile, text: string, mode: DocMode): FactGuardReport {
  const violations: FactViolation[] = [];
  if (mode === 'cv') checkCvStructure(profile, text, violations);
  checkLanguageClaims(profile, text, violations);
  checkNumbers(profile, text, violations);
  return { ok: violations.length === 0, violations };
}
