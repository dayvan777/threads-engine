import type { NormalizedJob, RemoteMode } from '../types';
import { decodeEntities, htmlToText } from '../util';
import { getJson, type Connector, type ConnectorContext } from './types';

interface GreenhouseJob {
  id: number;
  absolute_url: string;
  title: string;
  updated_at: string;
  location?: { name?: string };
  content?: string; // HTML-escaped HTML
  offices?: Array<{ name?: string }>;
  departments?: Array<{ name?: string }>;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

function remoteModeFromLocation(name: string): RemoteMode {
  const n = name.toLowerCase();
  if (n.includes('remote')) return 'remote';
  if (n.includes('hybrid')) return 'hybrid';
  return n ? 'onsite' : 'unknown';
}

/**
 * Greenhouse hosted job boards public API.
 * Config: { board: "acme" [, companyName: "Acme Inc" ] }
 * https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
 */
export const greenhouse: Connector = {
  kind: 'greenhouse',
  displayName: 'Greenhouse board (per company)',
  requiredConfig: ['board'],
  async fetchJobs(config, ctx?: ConnectorContext): Promise<NormalizedJob[]> {
    const board = String(config.board ?? '').trim();
    if (!board) throw new Error('greenhouse source requires config.board (the board slug)');
    const companyName = String(config.companyName ?? '').trim() || board;
    const res = await getJson<GreenhouseResponse>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
      ctx,
    );
    return (res.jobs ?? []).map((j) => {
      const location = j.location?.name ?? '';
      const departments = (j.departments ?? []).map((d) => d.name).filter(Boolean);
      return {
        sourceKind: 'greenhouse',
        externalId: String(j.id),
        url: j.absolute_url,
        title: j.title,
        company: companyName,
        location: location || undefined,
        remoteMode: remoteModeFromLocation(location),
        description:
          htmlToText(decodeEntities(j.content ?? '')) +
          (departments.length ? `\n\nDepartment: ${departments.join(', ')}` : ''),
        postedAt: j.updated_at ? new Date(j.updated_at).toISOString() : undefined,
        raw: j,
      } satisfies NormalizedJob;
    });
  },
};
