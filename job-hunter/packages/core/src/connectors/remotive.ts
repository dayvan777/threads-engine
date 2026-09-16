import type { NormalizedJob } from '../types';
import { htmlToText, parseSalaryText } from '../util';
import { getJson, type Connector, type ConnectorContext } from './types';

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

/**
 * Remotive public API for remote jobs. https://remotive.com/api/remote-jobs
 * Optional config: { search: "operations", category: "..." , limit: 100 }
 */
export const remotive: Connector = {
  kind: 'remotive',
  displayName: 'Remotive (remote jobs)',
  requiredConfig: [],
  async fetchJobs(config, ctx?: ConnectorContext): Promise<NormalizedJob[]> {
    const params = new URLSearchParams();
    params.set('limit', String(Math.min(Number(config.limit ?? 100) || 100, 200)));
    if (typeof config.search === 'string' && config.search) params.set('search', config.search);
    if (typeof config.category === 'string' && config.category) params.set('category', config.category);
    const res = await getJson<RemotiveResponse>(`https://remotive.com/api/remote-jobs?${params}`, ctx);
    return (res.jobs ?? []).map((j) => {
      const salary = parseSalaryText(j.salary);
      return {
        sourceKind: 'remotive',
        externalId: String(j.id),
        url: j.url,
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location || undefined,
        remoteMode: 'remote',
        salaryMin: salary.min,
        salaryMax: salary.max,
        salaryCurrency: salary.currency,
        salaryRaw: j.salary || undefined,
        description:
          htmlToText(j.description ?? '') +
          (j.tags?.length ? `\n\nTags: ${j.tags.join(', ')}` : ''),
        postedAt: j.publication_date ? new Date(j.publication_date).toISOString() : undefined,
        raw: j,
      } satisfies NormalizedJob;
    });
  },
};
