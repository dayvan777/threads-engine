import { canonicalizeUrl, dedupeHash } from '@jobhunter/core';
import { applications, jobAnalyses, jobs, nowIso } from '@jobhunter/db';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { analyzeStep } from '../agent/analyze';
import { addApplicationEvent } from '../agent/decide';

const ImportJobSchema = z.object({
  url: z.string().min(4),
  title: z.string().min(1),
  company: z.string().min(1),
  description: z.string().default(''),
  location: z.string().default(''),
  remoteMode: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).default('unknown'),
  salaryRaw: z.string().default(''),
});

export function jobRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/jobs', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 25)));
    const conds = [];
    if (q.status && q.status !== 'all') conds.push(eq(jobs.status, q.status));
    if (q.q) {
      const term = `%${q.q}%`;
      conds.push(or(like(jobs.title, term), like(jobs.company, term), like(jobs.location, term)));
    }
    const where = conds.length ? and(...conds) : undefined;
    const total = ctx.db.select({ c: sql<number>`count(*)` }).from(jobs).where(where).get()?.c ?? 0;
    const rows = ctx.db
      .select()
      .from(jobs)
      .where(where)
      .orderBy(desc(jobs.discoveredAt))
      .limit(limit)
      .offset((page - 1) * limit)
      .all();
    const items = rows.map((job) => {
      const analysis = ctx.db
        .select({ score: jobAnalyses.score, verdict: jobAnalyses.verdict })
        .from(jobAnalyses)
        .where(eq(jobAnalyses.jobId, job.id))
        .orderBy(desc(jobAnalyses.id))
        .limit(1)
        .get();
      const application = ctx.db
        .select({ id: applications.id, status: applications.status })
        .from(applications)
        .where(eq(applications.jobId, job.id))
        .get();
      const { raw, description, ...rest } = job;
      void raw;
      return {
        ...rest,
        descriptionPreview: description.slice(0, 240),
        score: analysis?.score ?? null,
        verdict: analysis?.verdict ?? null,
        application: application ?? null,
      };
    });
    return { items, total, page, limit };
  });

  app.get('/jobs/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const job = ctx.db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) return reply.code(404).send({ error: 'job not found' });
    const analyses = ctx.db
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.jobId, id))
      .orderBy(desc(jobAnalyses.id))
      .all();
    const application = ctx.db.select().from(applications).where(eq(applications.jobId, id)).get();
    return { job, analyses, application: application ?? null };
  });

  app.post('/jobs/import', async (req, reply) => {
    const parsed = ImportJobSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid input' });
    const input = parsed.data;
    const canonical = canonicalizeUrl(input.url);
    const hash = dedupeHash({ company: input.company, title: input.title, location: input.location, remoteMode: input.remoteMode });
    const result = ctx.db
      .insert(jobs)
      .values({
        sourceId: null,
        sourceKind: 'manual',
        url: input.url,
        canonicalUrl: canonical,
        dedupeHash: hash,
        title: input.title,
        company: input.company,
        location: input.location || null,
        remoteMode: input.remoteMode,
        salaryRaw: input.salaryRaw || null,
        description: input.description,
        discoveredAt: nowIso(),
        status: 'found',
      })
      .onConflictDoNothing()
      .run();
    if (result.changes === 0) return reply.code(409).send({ error: 'this job is already in the database (duplicate)' });
    const jobId = Number(result.lastInsertRowid);
    ctx.activity({ actor: 'user', type: 'import', message: `manually imported "${input.title}" at ${input.company}`, jobId });
    // Analyze right away — a manual import is an explicit signal of interest.
    void analyzeStep(ctx, { jobId }).catch(() => {});
    return { id: jobId };
  });

  app.post('/jobs/:id/analyze', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const job = ctx.db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) return reply.code(404).send({ error: 'job not found' });
    const stats = await analyzeStep(ctx, { jobId: id });
    if (stats.llmUnavailable || (stats.analyzed === 0 && stats.errors === 0)) {
      return reply.code(422).send({ error: 'analysis unavailable — is ANTHROPIC_API_KEY configured?' });
    }
    if (stats.errors > 0) return reply.code(502).send({ error: 'analysis failed — see Activity log' });
    return { ok: true };
  });

  app.post('/jobs/:id/archive', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const res = ctx.db.update(jobs).set({ status: 'archived' }).where(eq(jobs.id, id)).run();
    if (res.changes === 0) return reply.code(404).send({ error: 'job not found' });
    ctx.activity({ actor: 'user', type: 'job', message: `archived job #${id}`, jobId: id });
    return { ok: true };
  });

  /** User override: pursue a job regardless of the decision engine. */
  app.post('/jobs/:id/queue', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const job = ctx.db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) return reply.code(404).send({ error: 'job not found' });
    const existing = ctx.db.select({ id: applications.id }).from(applications).where(eq(applications.jobId, id)).get();
    if (existing) return reply.code(409).send({ error: `application #${existing.id} already exists for this job` });
    const now = nowIso();
    const inserted = ctx.db
      .insert(applications)
      .values({
        jobId: id,
        status: 'queued',
        intent: 'review',
        autonomyAtCreation: ctx.store.getSettings().autonomy,
        decision: { action: 'review', reason: 'queued manually by the user' },
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const appId = Number(inserted.lastInsertRowid);
    addApplicationEvent(ctx, appId, 'created', 'queued manually by the user');
    ctx.db.update(jobs).set({ status: 'qualified', skipReason: null }).where(eq(jobs.id, id)).run();
    ctx.activity({ actor: 'user', type: 'decide', message: `manually queued application for "${job.title}" at ${job.company}`, jobId: id, applicationId: appId });
    return { applicationId: appId };
  });
}
