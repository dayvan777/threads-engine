import fs from 'node:fs';
import { activityLog, applications, documents, jobs, pendingQuestions } from '@jobhunter/db';
import { and, desc, eq, gte, like, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Orchestrator, StepName } from '../agent/orchestrator';
import type { AppContext } from '../context';

const SUBMITTED_REACHED = ['submitted', 'response', 'interview', 'offer', 'rejected', 'withdrawn'];
const RESPONSE_REACHED = ['response', 'interview', 'offer', 'rejected'];
const INTERVIEW_REACHED = ['interview', 'offer'];

function count(ctx: AppContext, where: ReturnType<typeof eq> | ReturnType<typeof and> | undefined, table = jobs): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ctx.db.select({ c: sql<number>`count(*)` }).from(table as any).where(where).get()?.c ?? 0;
}

export function systemRoutes(app: FastifyInstance, ctx: AppContext, orchestrator: Orchestrator): void {
  app.get('/overview', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const appsAll = ctx.db.select().from(applications).all();
    const inStatuses = (list: string[]) => appsAll.filter((a) => list.includes(a.status)).length;

    const openQuestions = ctx.db.select().from(pendingQuestions).where(eq(pendingQuestions.status, 'open')).all();
    const attention: Array<Record<string, unknown>> = [];
    for (const a of appsAll) {
      if (!['ready_for_review', 'needs_action', 'needs_input', 'failed'].includes(a.status)) continue;
      const job = ctx.db.select({ title: jobs.title, company: jobs.company }).from(jobs).where(eq(jobs.id, a.jobId)).get();
      attention.push({
        kind: a.status,
        applicationId: a.id,
        jobTitle: job?.title ?? '?',
        company: job?.company ?? '?',
        detail:
          a.status === 'needs_input'
            ? `${openQuestions.filter((q) => q.applicationId === a.id).length} question(s) waiting`
            : a.status === 'ready_for_review'
              ? 'documents ready — approve to submit'
              : (a.failureReason ?? a.status),
      });
    }

    return {
      today: {
        found: count(ctx, like(jobs.discoveredAt, `${today}%`)),
        analyzed: ctx.db.select({ c: sql<number>`count(*)` }).from(jobs).where(and(like(jobs.discoveredAt, `${today}%`), sql`${jobs.status} IN ('analyzed','qualified')`)).get()?.c ?? 0,
        applied: appsAll.filter((a) => a.submittedAt?.startsWith(today)).length,
        skipped: count(ctx, and(like(jobs.discoveredAt, `${today}%`), eq(jobs.status, 'skipped_prefilter'))),
        needsAttention: attention.length,
      },
      pipeline: {
        found: count(ctx, eq(jobs.status, 'found')),
        analyzed: count(ctx, eq(jobs.status, 'analyzed')),
        qualified: count(ctx, eq(jobs.status, 'qualified')),
        applied: inStatuses(SUBMITTED_REACHED),
        response: inStatuses(RESPONSE_REACHED),
        interview: inStatuses(INTERVIEW_REACHED),
        offer: inStatuses(['offer']),
        rejected: inStatuses(['rejected']),
      },
      attention: attention.slice(0, 20),
      activity: ctx.db.select().from(activityLog).orderBy(desc(activityLog.id)).limit(15).all(),
      agent: {
        ...orchestrator.status(),
        llmConfigured: ctx.llm() !== null,
        applyEnabled: ctx.config.applyEnabled,
        autonomy: ctx.store.getSettings().autonomy,
      },
    };
  });

  app.get('/activity', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(200, Number(q.limit ?? 50));
    const conds = [];
    if (q.before) conds.push(sql`${activityLog.id} < ${Number(q.before)}`);
    if (q.type) conds.push(eq(activityLog.type, q.type));
    const rows = ctx.db
      .select()
      .from(activityLog)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(activityLog.id))
      .limit(limit)
      .all();
    return { items: rows };
  });

  // ---- Documents ----

  app.get('/documents', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const where = q.kind ? eq(documents.kind, q.kind) : undefined;
    const rows = ctx.db.select().from(documents).where(where).orderBy(desc(documents.id)).limit(200).all();
    return {
      items: rows.map(({ contentMd, ...rest }) => ({
        ...rest,
        sizeChars: contentMd.length,
        hasPdf: Boolean(rest.pdfPath && fs.existsSync(rest.pdfPath)),
      })),
    };
  });

  app.get('/documents/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const doc = ctx.db.select().from(documents).where(eq(documents.id, id)).get();
    if (!doc) return reply.code(404).send({ error: 'document not found' });
    return { document: doc };
  });

  app.get('/documents/:id/pdf', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const doc = ctx.db.select().from(documents).where(eq(documents.id, id)).get();
    if (!doc?.pdfPath || !fs.existsSync(doc.pdfPath)) return reply.code(404).send({ error: 'PDF not available' });
    return reply
      .type('application/pdf')
      .header('content-disposition', `inline; filename="document-${id}.pdf"`)
      .send(fs.createReadStream(doc.pdfPath));
  });

  // ---- Analytics ----

  app.get('/analytics', async () => {
    const appsAll = ctx.db.select().from(applications).all();
    const submitted = appsAll.filter((a) => SUBMITTED_REACHED.includes(a.status));
    const jobById = new Map(ctx.db.select().from(jobs).all().map((j) => [j.id, j]));

    const funnel = {
      found: ctx.db.select({ c: sql<number>`count(*)` }).from(jobs).get()?.c ?? 0,
      prefilterSkipped: count(ctx, eq(jobs.status, 'skipped_prefilter')),
      analyzed:
        ctx.db.select({ c: sql<number>`count(*)` }).from(jobs).where(sql`${jobs.status} IN ('analyzed','qualified')`).get()?.c ?? 0,
      qualified: count(ctx, eq(jobs.status, 'qualified')),
      applicationsCreated: appsAll.length,
      submitted: submitted.length,
      response: appsAll.filter((a) => RESPONSE_REACHED.includes(a.status)).length,
      interview: appsAll.filter((a) => INTERVIEW_REACHED.includes(a.status)).length,
      offer: appsAll.filter((a) => a.status === 'offer').length,
      rejected: appsAll.filter((a) => a.status === 'rejected').length,
    };
    const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
    const rates = {
      responseRate: rate(funnel.response, funnel.submitted),
      interviewRate: rate(funnel.interview, funnel.submitted),
      offerRate: rate(funnel.offer, funnel.submitted),
    };

    // Breakdown helper over submitted applications.
    const breakdown = (keyOf: (a: (typeof appsAll)[number]) => string | null) => {
      const groups = new Map<string, { submitted: number; responses: number; interviews: number }>();
      for (const a of submitted) {
        const key = keyOf(a);
        if (!key) continue;
        const g = groups.get(key) ?? { submitted: 0, responses: 0, interviews: 0 };
        g.submitted++;
        if (RESPONSE_REACHED.includes(a.status)) g.responses++;
        if (INTERVIEW_REACHED.includes(a.status)) g.interviews++;
        groups.set(key, g);
      }
      return [...groups.entries()]
        .map(([key, g]) => ({ key, ...g, responseRate: rate(g.responses, g.submitted) }))
        .sort((a, b) => b.submitted - a.submitted);
    };
    const scoreOf = (a: (typeof appsAll)[number]): number | null =>
      typeof (a.decision as { score?: number } | null)?.score === 'number'
        ? ((a.decision as { score: number }).score)
        : null;

    const breakdowns = {
      bySource: breakdown((a) => jobById.get(a.jobId)?.sourceKind ?? null),
      byScoreBucket: breakdown((a) => {
        const s = scoreOf(a);
        if (s === null) return null;
        return s >= 90 ? '90-100' : s >= 75 ? '75-89' : '<75';
      }),
      byWorkMode: breakdown((a) => jobById.get(a.jobId)?.remoteMode ?? null),
      byCity: breakdown((a) => {
        const loc = jobById.get(a.jobId)?.location ?? '';
        return loc ? (loc.split(/[,;|/]/)[0] ?? '').trim() || null : null;
      }),
    };

    // Applications & discoveries per day, last 30 days.
    const timeline: Array<{ date: string; found: number; submitted: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      timeline.push({
        date: d,
        found: count(ctx, like(jobs.discoveredAt, `${d}%`)),
        submitted: appsAll.filter((a) => a.submittedAt?.startsWith(d)).length,
      });
    }

    // Deterministic insights — surfaced, never auto-applied (Learning Loop MVP).
    const insights: string[] = [];
    if (funnel.submitted < 5) {
      insights.push('Not enough submitted applications yet for reliable patterns (need at least 5).');
    } else {
      const compare = (rows: ReturnType<typeof breakdown>, label: (k: string) => string) => {
        const eligible = rows.filter((r) => r.submitted >= 5 && r.responseRate !== null);
        if (eligible.length >= 2) {
          const sorted = [...eligible].sort((a, b) => (b.responseRate ?? 0) - (a.responseRate ?? 0));
          const best = sorted[0]!;
          const worst = sorted[sorted.length - 1]!;
          if ((best.responseRate ?? 0) >= (worst.responseRate ?? 0) * 1.5 && (best.responseRate ?? 0) > 0) {
            insights.push(
              `${label(best.key)} gets a ${best.responseRate}% response rate vs ${worst.responseRate}% for ${label(worst.key)} — consider prioritizing it.`,
            );
          }
        }
      };
      compare(breakdowns.bySource, (k) => `Source "${k}"`);
      compare(breakdowns.byWorkMode, (k) => `${k} roles`);
      compare(breakdowns.byScoreBucket, (k) => `Match score ${k}`);
      if ((rates.responseRate ?? 0) < 5 && funnel.submitted >= 10) {
        insights.push(
          'Overall response rate is under 5%. Consider raising the review threshold, tightening keywords, or revisiting the CV emphasis.',
        );
      }
    }

    return { funnel, rates, breakdowns, timeline, insights };
  });

  // ---- Agent control ----

  app.get('/agent/status', async () => ({
    ...orchestrator.status(),
    llmConfigured: ctx.llm() !== null,
    applyEnabled: ctx.config.applyEnabled,
  }));

  app.post('/agent/pause', async () => {
    orchestrator.pause('user');
    return { ok: true, paused: true };
  });

  app.post('/agent/resume', async () => {
    orchestrator.resume('user');
    return { ok: true, paused: false };
  });

  app.post('/agent/run', async (req, reply) => {
    const body = z
      .object({ steps: z.array(z.enum(['scan', 'analyze', 'decide', 'prepare', 'apply'])).optional() })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'invalid steps' });
    if (orchestrator.status().running) return reply.code(409).send({ error: 'a cycle is already running' });
    if (ctx.paused()) return reply.code(409).send({ error: 'agent is paused — resume it first' });
    void orchestrator.runCycle('manual', body.data.steps as StepName[] | undefined);
    ctx.activity({ actor: 'user', type: 'agent', message: `manual run triggered${body.data.steps ? ` (${body.data.steps.join(' → ')})` : ''}` });
    return { started: true };
  });
}
