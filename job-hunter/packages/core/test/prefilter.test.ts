import { describe, expect, it } from 'vitest';
import { prefilter } from '../src/prefilter';
import type { JobFacts } from '../src/types';
import { sampleSettings } from './fixtures';

const baseJob: JobFacts = {
  title: 'Operations Manager (m/w/d)',
  company: 'Logistik AG',
  location: 'Berlin, Germany',
  remoteMode: 'onsite',
  description: 'We are looking for an operations manager to run our Berlin warehouse.',
};

describe('prefilter', () => {
  it('passes a relevant job', () => {
    const r = prefilter(baseJob, sampleSettings());
    expect(r.pass).toBe(true);
    expect(r.relevance).toBeGreaterThan(0);
  });

  it('rejects blacklisted companies', () => {
    const r = prefilter(baseJob, sampleSettings({ blacklistCompanies: ['Logistik AG'] }));
    expect(r).toMatchObject({ pass: false, reason: 'blacklisted_company' });
  });

  it('rejects excluded keywords', () => {
    const r = prefilter(
      { ...baseJob, title: 'Operations Manager - Callcenter' },
      sampleSettings({ excludedKeywords: ['callcenter'] }),
    );
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('excluded_keyword');
  });

  it('rejects disallowed work modes', () => {
    const r = prefilter({ ...baseJob, remoteMode: 'onsite' }, sampleSettings({ workModes: ['remote'] }));
    expect(r).toMatchObject({ pass: false, reason: 'work_mode_not_allowed:onsite' });
  });

  it('rejects office jobs in other cities but keeps remote ones', () => {
    const hamburg = { ...baseJob, location: 'Hamburg' };
    expect(prefilter(hamburg, sampleSettings()).pass).toBe(false);
    expect(prefilter({ ...hamburg, remoteMode: 'remote' }, sampleSettings()).pass).toBe(true);
  });

  it('lets office jobs with unknown location through for the analyzer', () => {
    expect(prefilter({ ...baseJob, location: '' }, sampleSettings()).pass).toBe(true);
  });

  it('rejects salary ceilings below the minimum (same currency only)', () => {
    const low = { ...baseJob, salaryMax: 40000, salaryCurrency: 'EUR' };
    expect(prefilter(low, sampleSettings()).reason).toBe('salary_below_minimum');
    expect(prefilter({ ...low, salaryCurrency: 'USD' }, sampleSettings()).pass).toBe(true);
  });

  it('applies the keyword gate, bypassed by whitelist', () => {
    const irrelevant: JobFacts = {
      ...baseJob,
      title: 'Backend Engineer',
      description: 'Rust microservices.',
    };
    expect(prefilter(irrelevant, sampleSettings()).reason).toBe('no_keyword_overlap');
    expect(prefilter(irrelevant, sampleSettings({ strictKeywordGate: false })).pass).toBe(true);
    expect(prefilter(irrelevant, sampleSettings({ whitelistCompanies: ['Logistik AG'] })).pass).toBe(true);
  });
});
