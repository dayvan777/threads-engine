import type { Decision, JobAnalysis, Settings } from './types';
import { matchesCompanyList } from './util';

export interface DecideInput {
  analysis: JobAnalysis;
  settings: Settings;
  company: string;
  /** Applications already submitted (or auto-queued for submission) today. */
  todaySubmittedCount: number;
}

/**
 * Pure decision engine. Autonomy mode is applied by the orchestrator on top:
 * `auto_apply` is downgraded to `review` in assisted mode, and the decider is
 * not invoked at all in manual mode.
 */
export function decide({ analysis, settings, company, todaySubmittedCount }: DecideInput): Decision {
  const score = analysis.match_score;
  const hard = analysis.dealbreakers.filter((d) => d.severity === 'hard');
  const whitelisted = matchesCompanyList(company, settings.whitelistCompanies);
  const reviewThreshold = whitelisted
    ? Math.max(50, settings.reviewThreshold - 10)
    : settings.reviewThreshold;

  if (score < reviewThreshold) {
    return {
      action: 'skip',
      reason: `score ${score} below review threshold ${reviewThreshold}${whitelisted ? ' (whitelist-adjusted)' : ''}`,
    };
  }

  if (hard.length > 0) {
    return {
      action: 'review',
      reason: `score ${score}, but hard dealbreaker(s): ${hard.map((d) => d.detail).join('; ')}`,
    };
  }

  if (analysis.verdict === 'weak_match' || analysis.verdict === 'no_match') {
    return {
      action: 'review',
      reason: `score ${score} is inconsistent with verdict "${analysis.verdict}" — needs a human look`,
    };
  }

  if (todaySubmittedCount >= settings.maxApplicationsPerDay) {
    return {
      action: 'defer',
      reason: `daily application cap reached (${settings.maxApplicationsPerDay}); retrying tomorrow`,
    };
  }

  const band =
    score >= settings.autoApplyThreshold
      ? `auto-apply band (≥${settings.autoApplyThreshold})`
      : `review band (≥${reviewThreshold}) with no hard dealbreakers`;
  return { action: 'auto_apply', reason: `score ${score} in ${band}${whitelisted ? ', whitelisted company' : ''}` };
}
