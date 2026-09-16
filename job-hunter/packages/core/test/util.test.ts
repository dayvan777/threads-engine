import { describe, expect, it } from 'vitest';
import { findSavedAnswer } from '../src/questions';
import { containsPhrase, htmlToText, matchesCompanyList, normalizeText, parseSalaryText } from '../src/util';

describe('normalizeText', () => {
  it('folds diacritics, gender suffixes and punctuation', () => {
    expect(normalizeText('Senior Entwickler (m/w/d) — München!')).toBe('senior entwickler munchen');
    expect(normalizeText('Straße')).toBe('strasse');
  });
});

describe('containsPhrase', () => {
  it('matches padded phrases and long substrings (German compounds)', () => {
    expect(containsPhrase('Senior Operations Manager Berlin', 'operations manager')).toBe(true);
    expect(containsPhrase('Softwareentwickler gesucht', 'entwickler')).toBe(true);
    expect(containsPhrase('Manager', 'dev')).toBe(false);
  });
});

describe('matchesCompanyList', () => {
  it('matches inclusively but guards short entries', () => {
    expect(matchesCompanyList('Google Germany GmbH', ['google'])).toBe(true);
    expect(matchesCompanyList('Acme', ['ACME Inc'])).toBe(true);
    expect(matchesCompanyList('Some Company', ['x'])).toBe(false);
  });
});

describe('htmlToText', () => {
  it('converts structure to line breaks and bullets', () => {
    const text = htmlToText('<p>Hello<br>World</p><ul><li>One</li><li>Two &amp; three</li></ul>');
    expect(text).toContain('Hello\nWorld');
    expect(text).toContain('- One');
    expect(text).toContain('- Two & three');
  });
});

describe('parseSalaryText', () => {
  it('parses euro ranges', () => {
    expect(parseSalaryText('€50,000 - €70,000')).toEqual({ min: 50000, max: 70000, currency: 'EUR' });
  });
  it('parses k-suffixed ranges', () => {
    expect(parseSalaryText('50k-70k EUR')).toEqual({ min: 50000, max: 70000, currency: 'EUR' });
  });
  it('parses single dollar amounts', () => {
    expect(parseSalaryText('$120,000')).toEqual({ min: 120000, max: 120000, currency: 'USD' });
  });
  it('rejects non-yearly noise', () => {
    expect(parseSalaryText('competitive')).toEqual({ currency: undefined });
  });
});

describe('findSavedAnswer', () => {
  const saved = [
    { question: 'Are you authorized to work in the EU/Germany?', answer: 'Yes, EU citizen' },
    { question: 'What is your notice period?', answer: '3 months' },
  ];
  it('reuses near-identical questions', () => {
    expect(findSavedAnswer(saved, 'Are you authorized to work in Germany?')?.answer).toBe('Yes, EU citizen');
  });
  it('does not match unrelated questions', () => {
    expect(findSavedAnswer(saved, 'Which CRM tools have you used?')).toBeNull();
  });
});
