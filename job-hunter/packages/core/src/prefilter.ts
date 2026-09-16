import type { JobFacts, Settings } from './types';
import { containsPhrase, matchesCompanyList, tokenOverlap } from './util';

export interface PrefilterResult {
  pass: boolean;
  reason?: string;
  /** Heuristic keyword relevance, used to prioritize LLM analysis order. */
  relevance: number;
}

/** How strongly the job overlaps with desired titles/keywords (0 = no overlap). */
export function relevanceScore(job: JobFacts, settings: Settings): number {
  const terms = [...settings.desiredTitles, ...settings.keywords];
  let score = 0;
  for (const term of terms) {
    if (containsPhrase(job.title, term)) score += 3;
    else if (tokenOverlap(job.title, term)) score += 2;
    else if (containsPhrase(job.description, term)) score += 1;
  }
  return score;
}

/**
 * Deterministic hard filter that runs BEFORE any LLM call. Its job is to
 * discard obviously unsuitable postings cheaply; anything ambiguous passes
 * through so the analyzer can judge it.
 */
export function prefilter(job: JobFacts, settings: Settings): PrefilterResult {
  const relevance = relevanceScore(job, settings);

  if (matchesCompanyList(job.company, settings.blacklistCompanies)) {
    return { pass: false, reason: 'blacklisted_company', relevance };
  }
  const whitelisted = matchesCompanyList(job.company, settings.whitelistCompanies);

  for (const kw of settings.excludedKeywords) {
    if (containsPhrase(job.title, kw) || containsPhrase(job.description, kw)) {
      return { pass: false, reason: `excluded_keyword:${kw}`, relevance };
    }
  }

  const mode = job.remoteMode;
  if ((mode === 'remote' || mode === 'hybrid' || mode === 'onsite') && !settings.workModes.includes(mode)) {
    return { pass: false, reason: `work_mode_not_allowed:${mode}`, relevance };
  }

  // Office-bound roles must be in one of the configured cities. Jobs with an
  // unknown mode or empty location pass through — the analyzer judges those.
  if ((mode === 'onsite' || mode === 'hybrid') && settings.locations.length > 0) {
    const loc = job.location ?? '';
    if (loc && !settings.locations.some((city) => containsPhrase(loc, city))) {
      return { pass: false, reason: 'location_mismatch', relevance };
    }
  }

  if (settings.minSalary && job.salaryMax) {
    const currency = job.salaryCurrency ?? settings.salaryCurrency;
    if (currency === settings.salaryCurrency && job.salaryMax < settings.minSalary) {
      return { pass: false, reason: 'salary_below_minimum', relevance };
    }
  }

  const hasTerms = settings.desiredTitles.length + settings.keywords.length > 0;
  if (settings.strictKeywordGate && hasTerms && relevance === 0 && !whitelisted) {
    return { pass: false, reason: 'no_keyword_overlap', relevance };
  }

  return { pass: true, relevance };
}
