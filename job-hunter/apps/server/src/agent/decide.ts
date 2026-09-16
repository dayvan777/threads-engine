import { decide } from '@jobhunter/core';
import { applicationEvents, applications, jobAnalyses, jobs, nowIso } from '@jobhunter/db';
import { and, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import type { AppContext } from '../context';

export interface DecideStats {
  considered: number;
  queuedAuto: number;
  queuedReview: number;
  skipped: number;
  deferred: number;
}

/** Applications submitted today plus auto-intent ones still in flight — the daily-cap load. */
export function todayApplicationLoad(ctx: AppContext): number {
  const today = new Date().toISOString().slice(0, 10);
  const submitted =
    ctx.db
      .select({ c: sql<number>`count(*)` })
      .from(applications)
      .where(like(applications.submittedAt, `${today}%`))
      .get()?.c ?? 0;
  const inflight =
    ctx.db
      .select({ c: sql<number>`count(*)` })
      .from(applications)
      .where(
        and(
          inArray(applications.status, ['queued', 'preparing', 'approved', 'applying']),
          eq(applications.intent, 'auto_apply'),
        ),
      )
      .get()?.c ?? 0;
  return submitted + inflight;
}

export function addApplicationEvent(
  ctx: AppContext,
  applicationId: number,
  type: string,
  message: string,
  data?: unknown,
): void {
  ctx.db
    .insert(applicationEvents)
    .values({ applicationId, type, message, data: data ?? null, createdAt: nowIso() })
    .run();
}

/** Decider worker: turn qualified jobs into queued applications (or reasoned skips). */
export function decideStep(ctx: AppContext): DecideStats {
  const stats: DecideStats = { considered: 0, queuedAuto: 0, queuedReview: 0, skipped: 0, deferred: 0 };
  const settings = ctx.store.getSettings();
  if (settings.autonomy === 'manual') return stats; // find-only mode: no applications

  const candidates = ctx.db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, 'qualified'), isNull(jobs.skipReason)))
    .all();

  for (const job of candidates) {
    if (ctx.paused()) break;
    const existing = ctx.db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.jobId, job.id))
      .get();
    if (existing) continue;
    const analysisRow = ctx.db
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.jobId, job.id))
      .orderBy(desc(jobAnalyses.id))
      .limit(1)
      .get();
    if (!analysisRow) continue;
    stats.considered++;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const analysis = analysisRow.data as any;
    let decision = decide({
      analysis,
      settings,
      company: job.company,
      todaySubmittedCount: todayApplicationLoad(ctx),
    });
    if (decision.action === 'auto_apply' && settings.autonomy === 'assisted') {
      decision = { action: 'review', reason: `${decision.reason} [assisted mode: human approval required]` };
    }

    if (decision.action === 'skip') {
      stats.skipped++;
      ctx.db.update(jobs).set({ skipReason: `decision:${decision.reason}` }).where(eq(jobs.id, job.id)).run();
      continue;
    }
    if (decision.action === 'defer') {
      stats.deferred++;
      continue; // retried next cycle once the daily cap resets
    }

    const intent = decision.action === 'auto_apply' ? 'auto_apply' : 'review';
    const now = nowIso();
    const inserted = ctx.db
      .insert(applications)
      .values({
        jobId: job.id,
        status: 'queued',
        intent,
        autonomyAtCreation: settings.autonomy,
        decision: { ...decision, score: analysisRow.score },
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const appId = Number(inserted.lastInsertRowid);
    addApplicationEvent(ctx, appId, 'created', `queued (${intent}) — ${decision.reason}`);
    if (intent === 'auto_apply') stats.queuedAuto++;
    else stats.queuedReview++;
    ctx.activity({
      actor: 'agent',
      type: 'decide',
      message: `queued application for "${job.title}" at ${job.company} (${intent === 'auto_apply' ? 'auto' : 'for review'}, score ${analysisRow.score})`,
      jobId: job.id,
      applicationId: appId,
    });
  }

  if (stats.deferred > 0) {
    ctx.activity({
      actor: 'agent',
      type: 'decide',
      message: `deferred ${stats.deferred} application(s): daily cap of ${settings.maxApplicationsPerDay} reached`,
    });
  }
  return stats;
}
