import { MasterProfileSchema, SettingsSchema, type MasterProfile, type Settings } from '../src/types';

export function sampleProfile(): MasterProfile {
  return MasterProfileSchema.parse({
    fullName: 'Max Mustermann',
    email: 'max@example.com',
    location: 'Berlin, Germany',
    headline: 'Operations Manager',
    summary: 'Operations professional with a logistics background and own AI side projects.',
    workExperience: [
      {
        company: 'Acme Logistics GmbH',
        title: 'Operations Manager',
        start: '2019-03',
        end: '',
        current: true,
        summary: 'Led warehouse operations.',
        highlights: ['Managed a team of 12 people', 'Reduced processing time by 30%'],
      },
      {
        company: 'Beta Retail',
        title: 'Team Lead Customer Service',
        start: '2016-01',
        end: '2019-02',
        current: false,
        summary: '',
        highlights: ['Handled 200 tickets weekly'],
      },
    ],
    education: [
      { institution: 'HU Berlin', degree: 'B.Sc.', field: 'Business Administration', start: '2012', end: '2016' },
    ],
    projects: [{ name: 'ShiftPlanner', description: 'AI shift scheduling app', technologies: ['TypeScript'] }],
    skills: ['Process Management', 'Excel', 'SQL'],
    languages: [
      { language: 'German', level: 'B1' },
      { language: 'English', level: 'C1' },
      { language: 'Russian', level: 'native' },
    ],
    certifications: ['Lean Six Sigma Yellow Belt'],
    salaryExpectation: '55000 EUR',
  });
}

export function sampleSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...SettingsSchema.parse({
    desiredTitles: ['Operations Manager', 'Team Lead'],
    keywords: ['logistics', 'operations'],
    locations: ['Berlin'],
    minSalary: 50000,
  }), ...overrides };
}
