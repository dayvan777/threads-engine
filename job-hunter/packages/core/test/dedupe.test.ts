import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, dedupeHash, dedupeKey } from '../src/dedupe';

describe('canonicalizeUrl', () => {
  it('strips tracking params, hash, www and trailing slash', () => {
    expect(canonicalizeUrl('https://www.Example.com/jobs/123/?utm_source=x&ref=abc#apply')).toBe(
      'https://example.com/jobs/123',
    );
  });
  it('sorts remaining params and keeps meaningful ones', () => {
    expect(canonicalizeUrl('https://example.com/j?b=2&a=1&gh_src=foo')).toBe('https://example.com/j?a=1&b=2');
  });
  it('returns input unchanged when not a URL', () => {
    expect(canonicalizeUrl('not a url')).toBe('not a url');
  });
});

describe('dedupeHash', () => {
  it('matches across gender suffixes, diacritics and country suffixes in location', () => {
    const a = dedupeHash({
      company: 'ACME GmbH',
      title: 'Senior Entwickler (m/w/d)',
      location: 'München, Deutschland',
      remoteMode: 'onsite',
    });
    const b = dedupeHash({
      company: 'Acme GmbH',
      title: 'Senior Entwickler',
      location: 'Munchen',
      remoteMode: 'onsite',
    });
    expect(a).toBe(b);
  });

  it('ignores location for remote jobs', () => {
    const a = dedupeKey({ company: 'X', title: 'Dev', location: 'Anywhere (EU)', remoteMode: 'remote' });
    const b = dedupeKey({ company: 'X', title: 'Dev', location: '', remoteMode: 'remote' });
    expect(a).toBe(b);
  });

  it('differs for different companies', () => {
    const a = dedupeHash({ company: 'Acme', title: 'Dev', location: 'Berlin', remoteMode: 'onsite' });
    const b = dedupeHash({ company: 'Globex', title: 'Dev', location: 'Berlin', remoteMode: 'onsite' });
    expect(a).not.toBe(b);
  });
});
