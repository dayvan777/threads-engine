import { describe, expect, it } from 'vitest';
import { decide } from '../src/decide';
import { JobAnalysisSchema, type JobAnalysis } from '../src/types';
import { sampleSettings } from './fixtures';

function analysis(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return {
    ...JobAnalysisSchema.parse({
      match_score: 92,
      verdict: 'strong_match',
      pros: [],
      cons: [],
      dealbreakers: [],
      missing_requirements: [],
      language_fit: { required: null, meets: null, note: '' },
      salary_fit: 'unknown',
      location_fit: 'good',
      seniority_fit: 'match',
      summary: 'ok',
    }),
    ...overrides,
  };
}

const base = { settings: sampleSettings(), company: 'Acme', todaySubmittedCount: 0 };

describe('decide', () => {
  it('auto-applies high scores without dealbreakers', () => {
    expect(decide({ ...base, analysis: analysis() }).action).toBe('auto_apply');
  });

  it('auto-applies review-band scores without hard dealbreakers', () => {
    const a = analysis({
      match_score: 80,
      verdict: 'good_match',
      dealbreakers: [{ kind: 'language', detail: 'German B2 preferred', severity: 'soft' }],
    });
    expect(decide({ ...base, analysis: a }).action).toBe('auto_apply');
  });

  it('routes hard dealbreakers to human review', () => {
    const a = analysis({
      match_score: 86,
      verdict: 'good_match',
      dealbreakers: [{ kind: 'language', detail: 'fluent German required', severity: 'hard' }],
    });
    const d = decide({ ...base, analysis: a });
    expect(d.action).toBe('review');
    expect(d.reason).toContain('fluent German required');
  });

  it('skips below the review threshold', () => {
    expect(decide({ ...base, analysis: analysis({ match_score: 60, verdict: 'possible_match' }) }).action).toBe('skip');
  });

  it('defers when the daily cap is reached', () => {
    expect(decide({ ...base, todaySubmittedCount: 10, analysis: analysis() }).action).toBe('defer');
  });

  it('lowers the threshold for whitelisted companies', () => {
    const a = analysis({ match_score: 70, verdict: 'possible_match' });
    expect(decide({ ...base, analysis: a }).action).toBe('skip');
    const settings = sampleSettings({ whitelistCompanies: ['Acme'] });
    expect(decide({ ...base, settings, analysis: a }).action).toBe('auto_apply');
  });

  it('flags score/verdict inconsistency for review', () => {
    const a = analysis({ match_score: 85, verdict: 'weak_match' });
    expect(decide({ ...base, analysis: a }).action).toBe('review');
  });
});
