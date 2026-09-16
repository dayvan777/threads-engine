import { describe, expect, it } from 'vitest';
import { factGuard } from '../src/documents/factguard';
import { renderMasterCvMd } from '../src/profile';
import { sampleProfile } from './fixtures';

describe('factGuard on CVs', () => {
  it('accepts the deterministic master CV render (self-consistency)', () => {
    const p = sampleProfile();
    const report = factGuard(p, renderMasterCvMd(p), 'cv');
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('flags an invented employer', () => {
    const p = sampleProfile();
    const md = renderMasterCvMd(p).replace('Acme Logistics GmbH', 'Google');
    const report = factGuard(p, md, 'cv');
    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.type === 'unknown_employer')).toBe(true);
  });

  it('flags an inflated language level', () => {
    const p = sampleProfile();
    const md = renderMasterCvMd(p).replace('German — B1', 'German — C1');
    const report = factGuard(p, md, 'cv');
    expect(report.violations.some((v) => v.type === 'inflated_language_level')).toBe(true);
  });

  it('flags numbers with no source in the profile', () => {
    const p = sampleProfile();
    const md = `${renderMasterCvMd(p)}\n- Increased revenue by 45%\n`;
    const report = factGuard(p, md, 'cv');
    expect(report.violations.some((v) => v.type === 'unsupported_number' && v.detail.includes('45'))).toBe(true);
  });

  it('allows career-length durations', () => {
    const p = sampleProfile();
    const md = renderMasterCvMd(p).replace(
      '## Summary\n',
      '## Summary\n\n8 years of operations experience.\n',
    );
    const report = factGuard(p, md, 'cv');
    expect(report.violations.filter((v) => v.type === 'unsupported_number')).toEqual([]);
  });

  it('flags an invented certification', () => {
    const p = sampleProfile();
    const md = `${renderMasterCvMd(p)}\n- PMP Certification\n`;
    // append inside the certifications section
    const withCert = renderMasterCvMd(p).replace(
      '- Lean Six Sigma Yellow Belt',
      '- Lean Six Sigma Yellow Belt\n- PMP Certification',
    );
    expect(factGuard(p, withCert, 'cv').violations.some((v) => v.type === 'unknown_certification')).toBe(true);
    void md;
  });
});

describe('factGuard on cover letters', () => {
  it('accepts a letter with only profile-backed claims', () => {
    const p = sampleProfile();
    const letter = [
      'Hello Acme team,',
      '',
      'Your posting for an Operations Manager matches what I do today at Acme Logistics GmbH: I run warehouse operations and lead a team of 12 people.',
      'At Beta Retail I led customer service, handling 200 tickets weekly.',
      '',
      'Best regards,',
      'Max Mustermann',
    ].join('\n');
    expect(factGuard(p, letter, 'letter').ok).toBe(true);
  });

  it('rejects fabricated metrics in a letter', () => {
    const p = sampleProfile();
    const letter = 'I grew revenue by 300% at my last job.\n\nMax';
    const report = factGuard(p, letter, 'letter');
    expect(report.violations.some((v) => v.type === 'unsupported_number')).toBe(true);
  });
});
