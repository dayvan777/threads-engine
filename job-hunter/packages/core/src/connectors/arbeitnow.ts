import type { NormalizedJob } from '../types';
import { htmlToText } from '../util';
import { getJson, type Connector, type ConnectorContext } from './types';

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number; // unix seconds
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
  links?: { next?: string | null };
}

/**
 * Arbeitnow job board API — free public API focused on jobs in Germany/Europe.
 * https://www.arbeitnow.com/api/job-board-api
 */
export const arbeitnow: Connector = {
  kind: 'arbeitnow',
  displayName: 'Arbeitnow (Germany/EU)',
  requiredConfig: [],
  async fetchJobs(config, ctx?: ConnectorContext): Promise<NormalizedJob[]> {
    const pages = Math.min(Number(config.pages ?? 2) || 2, 5);
    const jobs: NormalizedJob[] = [];
    for (let page = 1; page <= pages; page++) {
      const res = await getJson<ArbeitnowResponse>(
        `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
        ctx,
      );
      for (const j of res.data ?? []) {
        const tags = [...(j.job_types ?? []), ...(j.tags ?? [])].filter(Boolean);
        jobs.push({
          sourceKind: 'arbeitnow',
          externalId: j.slug,
          url: j.url,
          title: j.title,
          company: j.company_name,
          location: j.location || undefined,
          remoteMode: j.remote ? 'remote' : 'onsite',
          description: htmlToText(j.description ?? '') + (tags.length ? `\n\nTags: ${tags.join(', ')}` : ''),
          postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : undefined,
          raw: j,
        });
      }
      if (!res.links?.next) break;
    }
    return jobs;
  },
};
