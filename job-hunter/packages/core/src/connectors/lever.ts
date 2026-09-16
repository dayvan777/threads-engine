import type { NormalizedJob, RemoteMode } from '../types';
import { htmlToText } from '../util';
import { getJson, type Connector, type ConnectorContext } from './types';

interface LeverPosting {
  id: string;
  text: string; // title
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number; // ms
  country?: string;
  workplaceType?: string; // remote | hybrid | on-site | unspecified
  categories?: { commitment?: string; department?: string; location?: string; team?: string; allLocations?: string[] };
  descriptionPlain?: string;
  description?: string;
  lists?: Array<{ text: string; content: string }>;
  additionalPlain?: string;
}

function remoteModeFrom(p: LeverPosting): RemoteMode {
  const w = (p.workplaceType ?? '').toLowerCase();
  if (w === 'remote') return 'remote';
  if (w === 'hybrid') return 'hybrid';
  if (w === 'on-site' || w === 'onsite') return 'onsite';
  if ((p.categories?.location ?? '').toLowerCase().includes('remote')) return 'remote';
  return 'unknown';
}

/**
 * Lever public postings API. Config: { org: "acme" [, companyName: "Acme Inc" ] }
 * https://api.lever.co/v0/postings/{org}?mode=json
 */
export const lever: Connector = {
  kind: 'lever',
  displayName: 'Lever postings (per company)',
  requiredConfig: ['org'],
  async fetchJobs(config, ctx?: ConnectorContext): Promise<NormalizedJob[]> {
    const org = String(config.org ?? '').trim();
    if (!org) throw new Error('lever source requires config.org (the Lever org slug)');
    const companyName = String(config.companyName ?? '').trim() || org;
    const res = await getJson<LeverPosting[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(org)}?mode=json`,
      ctx,
    );
    return (res ?? []).map((p) => {
      const lists = (p.lists ?? [])
        .map((l) => `${l.text}\n${htmlToText(l.content)}`)
        .join('\n\n');
      const description = [p.descriptionPlain ?? htmlToText(p.description ?? ''), lists, p.additionalPlain ?? '']
        .filter(Boolean)
        .join('\n\n');
      return {
        sourceKind: 'lever',
        externalId: p.id,
        url: p.hostedUrl,
        title: p.text,
        company: companyName,
        location: p.categories?.location || undefined,
        remoteMode: remoteModeFrom(p),
        description,
        postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
        raw: p,
      } satisfies NormalizedJob;
    });
  },
};
