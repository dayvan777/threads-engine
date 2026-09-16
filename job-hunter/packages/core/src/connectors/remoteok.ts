import type { NormalizedJob } from '../types';
import { htmlToText } from '../util';
import { getJson, type Connector, type ConnectorContext } from './types';

interface RemoteOkJob {
  id: string | number;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  tags?: string[];
  description?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
  apply_url?: string;
  date?: string;
}

/**
 * RemoteOK public API (https://remoteok.com/api). The first array element is a
 * legal notice object; RemoteOK requires linking back to the original posting,
 * which we always do (the stored job URL is the RemoteOK page).
 */
export const remoteok: Connector = {
  kind: 'remoteok',
  displayName: 'RemoteOK (remote jobs)',
  requiredConfig: [],
  async fetchJobs(_config, ctx?: ConnectorContext): Promise<NormalizedJob[]> {
    const res = await getJson<RemoteOkJob[]>('https://remoteok.com/api', ctx);
    return (res ?? [])
      .filter((j) => j && j.id && j.position && j.company)
      .map((j) => ({
        sourceKind: 'remoteok',
        externalId: String(j.id),
        url: j.url || `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`,
        title: j.position!,
        company: j.company!,
        location: j.location || undefined,
        remoteMode: 'remote' as const,
        salaryMin: j.salary_min && j.salary_min > 10_000 ? j.salary_min : undefined,
        salaryMax: j.salary_max && j.salary_max > 10_000 ? j.salary_max : undefined,
        salaryCurrency: j.salary_min || j.salary_max ? 'USD' : undefined,
        description:
          htmlToText(j.description ?? '') + (j.tags?.length ? `\n\nTags: ${j.tags.join(', ')}` : ''),
        postedAt: j.date ? new Date(j.date).toISOString() : undefined,
        raw: j,
      }));
  },
};
