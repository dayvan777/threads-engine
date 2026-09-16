import { describe, expect, it } from 'vitest';
import { arbeitnow } from '../src/connectors/arbeitnow';
import { greenhouse } from '../src/connectors/greenhouse';
import { lever } from '../src/connectors/lever';
import { remoteok } from '../src/connectors/remoteok';
import { remotive } from '../src/connectors/remotive';

function fakeFetch(payloads: unknown[]): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  const fetchImpl = (async (url: unknown) => {
    calls.push(String(url));
    const payload = payloads[Math.min(i++, payloads.length - 1)];
    return { ok: true, status: 200, json: async () => payload };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('arbeitnow connector', () => {
  it('normalizes jobs and stops when there is no next page', async () => {
    const { fetchImpl, calls } = fakeFetch([
      {
        data: [
          {
            slug: 'ops-manager-berlin',
            company_name: 'Logistik AG',
            title: 'Operations Manager (m/w/d)',
            description: '<p>Run our <b>warehouse</b></p>',
            remote: false,
            url: 'https://www.arbeitnow.com/view/ops-manager-berlin',
            tags: ['Logistics'],
            job_types: ['full-time'],
            location: 'Berlin',
            created_at: 1700000000,
          },
        ],
        links: { next: null },
      },
    ]);
    const jobs = await arbeitnow.fetchJobs({}, { fetchImpl });
    expect(calls).toHaveLength(1);
    expect(jobs).toHaveLength(1);
    const j = jobs[0]!;
    expect(j).toMatchObject({
      sourceKind: 'arbeitnow',
      company: 'Logistik AG',
      remoteMode: 'onsite',
      location: 'Berlin',
    });
    expect(j.description).toContain('Run our warehouse');
    expect(j.description).toContain('Tags: full-time, Logistics');
    expect(j.postedAt).toBe(new Date(1700000000 * 1000).toISOString());
  });
});

describe('remotive connector', () => {
  it('parses salary text and marks jobs remote', async () => {
    const { fetchImpl } = fakeFetch([
      {
        jobs: [
          {
            id: 42,
            url: 'https://remotive.com/jobs/42',
            title: 'Operations Lead',
            company_name: 'RemoteCo',
            category: 'Business',
            tags: ['operations'],
            job_type: 'full_time',
            publication_date: '2026-09-01T00:00:00',
            candidate_required_location: 'Europe',
            salary: '€50,000 - €70,000',
            description: '<p>Lead ops</p>',
          },
        ],
      },
    ]);
    const [j] = await remotive.fetchJobs({}, { fetchImpl });
    expect(j).toMatchObject({
      remoteMode: 'remote',
      salaryMin: 50000,
      salaryMax: 70000,
      salaryCurrency: 'EUR',
      location: 'Europe',
    });
  });
});

describe('remoteok connector', () => {
  it('drops the leading legal-notice element', async () => {
    const { fetchImpl } = fakeFetch([
      [
        { legal: 'API terms …' },
        {
          id: 99,
          slug: 'ops-99',
          position: 'Ops Manager',
          company: 'OK Corp',
          description: 'Do ops',
          tags: ['ops'],
          salary_min: 60000,
          salary_max: 80000,
          url: 'https://remoteok.com/remote-jobs/ops-99',
          date: '2026-09-02T00:00:00+00:00',
        },
      ],
    ]);
    const jobs = await remoteok.fetchJobs({}, { fetchImpl });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ title: 'Ops Manager', company: 'OK Corp', salaryCurrency: 'USD' });
  });
});

describe('greenhouse connector', () => {
  it('unescapes content and detects remote locations', async () => {
    const { fetchImpl, calls } = fakeFetch([
      {
        jobs: [
          {
            id: 123,
            absolute_url: 'https://boards.greenhouse.io/acme/jobs/123',
            title: 'Operations Manager',
            updated_at: '2026-09-01T10:00:00-04:00',
            location: { name: 'Remote - Germany' },
            content: '&lt;p&gt;Own our processes&lt;/p&gt;',
            departments: [{ name: 'Ops' }],
          },
        ],
      },
    ]);
    const [j] = await greenhouse.fetchJobs({ board: 'acme', companyName: 'Acme Inc' }, { fetchImpl });
    expect(calls[0]).toContain('boards-api.greenhouse.io/v1/boards/acme/jobs');
    expect(j).toMatchObject({ company: 'Acme Inc', remoteMode: 'remote' });
    expect(j!.description).toContain('Own our processes');
  });

  it('requires the board slug', async () => {
    await expect(greenhouse.fetchJobs({}, { fetchImpl: fakeFetch([{}]).fetchImpl })).rejects.toThrow(/board/);
  });
});

describe('lever connector', () => {
  it('normalizes postings with lists and workplaceType', async () => {
    const { fetchImpl } = fakeFetch([
      [
        {
          id: 'abc-123',
          text: 'Ops Manager',
          hostedUrl: 'https://jobs.lever.co/acme/abc-123',
          createdAt: 1756700000000,
          workplaceType: 'hybrid',
          categories: { location: 'Berlin', commitment: 'Full-time' },
          descriptionPlain: 'Own operations.',
          lists: [{ text: 'Requirements', content: '<li>3 years ops</li>' }],
        },
      ],
    ]);
    const [j] = await lever.fetchJobs({ org: 'acme' }, { fetchImpl });
    expect(j).toMatchObject({ remoteMode: 'hybrid', location: 'Berlin', title: 'Ops Manager' });
    expect(j!.description).toContain('Own operations.');
    expect(j!.description).toContain('Requirements');
    expect(j!.description).toContain('3 years ops');
  });
});
