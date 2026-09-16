import { canonicalizeUrl, dedupeHash, getConnector, type NormalizedJob } from '@jobhunter/core';
import { jobs, nowIso, sources } from '@jobhunter/db';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../context';

export interface ScanStats {
  sourcesScanned: number;
  fetched: number;
  inserted: number;
  duplicates: number;
  errors: number;
}

export function insertNormalizedJob(
  ctx: AppContext,
  job: NormalizedJob,
  sourceId: number | null,
): { inserted: boolean; jobId?: number } {
  const canonical = canonicalizeUrl(job.url);
  const hash = dedupeHash(job);
  const result = ctx.db
    .insert(jobs)
    .values({
      sourceId,
      sourceKind: job.sourceKind,
      externalId: job.externalId ?? null,
      url: job.url,
      canonicalUrl: canonical,
      dedupeHash: hash,
      title: job.title,
      company: job.company,
      companyUrl: job.companyUrl ?? null,
      location: job.location ?? null,
      remoteMode: job.remoteMode,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      salaryCurrency: job.salaryCurrency ?? null,
      salaryRaw: job.salaryRaw ?? null,
      description: job.description,
      lang: job.lang ?? null,
      postedAt: job.postedAt ?? null,
      discoveredAt: nowIso(),
      status: 'found',
      raw: job.raw ?? null,
    })
    .onConflictDoNothing()
    .run();
  if (result.changes === 0) return { inserted: false };
  return { inserted: true, jobId: Number(result.lastInsertRowid) };
}

/** Scout worker: fetch due sources, normalize, dedupe, store new postings. */
export async function scanStep(
  ctx: AppContext,
  opts: { force?: boolean; sourceId?: number } = {},
): Promise<ScanStats> {
  const stats: ScanStats = { sourcesScanned: 0, fetched: 0, inserted: 0, duplicates: 0, errors: 0 };
  const settings = ctx.store.getSettings();
  const intervalMs = settings.scanIntervalHours * 3600 * 1000;
  const all = ctx.db.select().from(sources).all();

  for (const source of all) {
    if (ctx.paused()) break;
    if (opts.sourceId !== undefined && source.id !== opts.sourceId) continue;
    if (!source.enabled && opts.sourceId === undefined) continue;
    const due =
      opts.force ||
      opts.sourceId !== undefined ||
      !source.lastScanAt ||
      Date.now() - new Date(source.lastScanAt).getTime() >= intervalMs;
    if (!due) continue;

    const connector = getConnector(source.kind);
    if (!connector) continue; // e.g. "manual" pseudo-sources

    try {
      const fetched = await connector.fetchJobs((source.config ?? {}) as Record<string, unknown>);
      let inserted = 0;
      let duplicates = 0;
      for (const job of fetched) {
        const res = insertNormalizedJob(ctx, job, source.id);
        if (res.inserted) inserted++;
        else duplicates++;
      }
      stats.sourcesScanned++;
      stats.fetched += fetched.length;
      stats.inserted += inserted;
      stats.duplicates += duplicates;
      ctx.db
        .update(sources)
        .set({
          lastScanAt: nowIso(),
          lastStatus: `ok: ${fetched.length} postings, ${inserted} new`,
          lastError: null,
        })
        .where(eq(sources.id, source.id))
        .run();
      ctx.activity({
        actor: 'agent',
        type: 'scan',
        message: `scanned ${source.name}: ${fetched.length} postings, ${inserted} new, ${duplicates} known`,
        data: { sourceId: source.id },
      });
    } catch (err) {
      stats.errors++;
      const message = (err as Error).message;
      ctx.db
        .update(sources)
        .set({ lastScanAt: nowIso(), lastStatus: 'error', lastError: message })
        .where(eq(sources.id, source.id))
        .run();
      ctx.activity({
        actor: 'agent',
        type: 'scan_error',
        message: `scan of ${source.name} failed: ${message}`,
        data: { sourceId: source.id },
      });
    }
  }
  return stats;
}
