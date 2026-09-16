import { applicationEvents, applications, documents, jobs, nowIso, pendingQuestions } from '@jobhunter/db';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { applyStep } from '../agent/apply/index';
import { addApplicationEvent } from '../agent/decide';
import { prepareStep } from '../agent/prepare';
import type { AppContext } from '../context';

const MANUAL_STATUSES = ['response', 'interview', 'offer', 'rejected', 'withdrawn', 'submitted'] as const;

function jobSummary(ctx: AppContext, jobId: number) {
  const job = ctx.db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) return null;
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    remoteMode: job.remoteMode,
    url: job.url,
    sourceKind: job.sourceKind,
  };
}

export function applicationRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/applications', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const where = q.status && q.status !== 'all' ? eq(applications.status, q.status) : undefined;
    const rows = ctx.db.select().from(applications).where(where).orderBy(desc(applications.updatedAt)).limit(300).all();
    return {
      items: rows.map((a) => ({
        ...a,
        job: jobSummary(ctx, a.jobId),
        openQuestions:
          ctx.db
            .select({ id: pendingQuestions.id })
            .from(pendingQuestions)
            .where(and(eq(pendingQuestions.applicationId, a.id), eq(pendingQuestions.status, 'open')))
            .all().length,
      })),
    };
  });

  app.get('/applications/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const application = ctx.db.select().from(applications).where(eq(applications.id, id)).get();
    if (!application) return reply.code(404).send({ error: 'application not found' });
    const events = ctx.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, id))
      .orderBy(desc(applicationEvents.id))
      .all();
    const docs = ctx.db.select().from(documents).where(eq(documents.applicationId, id)).all();
    const questions = ctx.db.select().from(pendingQuestions).where(eq(pendingQuestions.applicationId, id)).all();
    return { application, job: jobSummary(ctx, application.jobId), events, documents: docs, questions };
  });

  /** Approve a prepared application → submit (assisted flow) or retry after needs_action/failed. */
  app.post('/applications/:id/approve', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const application = ctx.db.select().from(applications).where(eq(applications.id, id)).get();
    if (!application) return reply.code(404).send({ error: 'application not found' });
    if (!['ready_for_review', 'needs_action', 'failed', 'needs_input'].includes(application.status)) {
      return reply.code(409).send({ error: `cannot approve from status "${application.status}"` });
    }
    const open = ctx.db
      .select({ id: pendingQuestions.id })
      .from(pendingQuestions)
      .where(and(eq(pendingQuestions.applicationId, id), eq(pendingQuestions.status, 'open')))
      .all();
    if (open.length > 0) {
      return reply.code(409).send({ error: `${open.length} open question(s) must be answered first` });
    }
    ctx.db.update(applications).set({ status: 'approved', failureReason: null, updatedAt: nowIso() }).where(eq(applications.id, id)).run();
    addApplicationEvent(ctx, id, 'approved', 'approved by the user — submitting');
    ctx.activity({ actor: 'user', type: 'apply', message: `approved application #${id} for submission`, applicationId: id });
    void applyStep(ctx, { applicationId: id }).catch((err) =>
      ctx.activity({ actor: 'system', type: 'apply_error', message: `submission crashed: ${(err as Error).message}`, applicationId: id }),
    );
    return { ok: true, status: 'approved' };
  });

  app.post('/applications/:id/discard', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const res = ctx.db
      .update(applications)
      .set({ status: 'discarded', updatedAt: nowIso() })
      .where(eq(applications.id, id))
      .run();
    if (res.changes === 0) return reply.code(404).send({ error: 'application not found' });
    addApplicationEvent(ctx, id, 'discarded', 'discarded by the user');
    ctx.activity({ actor: 'user', type: 'apply', message: `discarded application #${id}`, applicationId: id });
    return { ok: true };
  });

  /** Manual pipeline tracking until email integration exists. */
  app.post('/applications/:id/status', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z.object({ status: z.enum(MANUAL_STATUSES), note: z.string().default('') }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid status' });
    const application = ctx.db.select().from(applications).where(eq(applications.id, id)).get();
    if (!application) return reply.code(404).send({ error: 'application not found' });
    const extra: Record<string, unknown> = { status: body.data.status, updatedAt: nowIso() };
    if (body.data.status === 'submitted' && !application.submittedAt) extra.submittedAt = nowIso();
    ctx.db.update(applications).set(extra).where(eq(applications.id, id)).run();
    addApplicationEvent(ctx, id, body.data.status, body.data.note || `status set to ${body.data.status} by the user`);
    ctx.activity({ actor: 'user', type: 'track', message: `application #${id} → ${body.data.status}${body.data.note ? ` (${body.data.note})` : ''}`, applicationId: id });
    return { ok: true };
  });

  /** Re-run document preparation (e.g. after a profile update). */
  app.post('/applications/:id/reprepare', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const application = ctx.db.select().from(applications).where(eq(applications.id, id)).get();
    if (!application) return reply.code(404).send({ error: 'application not found' });
    ctx.db.update(applications).set({ status: 'queued', updatedAt: nowIso() }).where(eq(applications.id, id)).run();
    addApplicationEvent(ctx, id, 'queued', 'documents will be regenerated');
    void prepareStep(ctx, { applicationId: id }).catch(() => {});
    return { ok: true };
  });

  // ---- Needs Input questions ----

  app.get('/questions', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const where = q.status ? eq(pendingQuestions.status, q.status) : eq(pendingQuestions.status, 'open');
    const rows = ctx.db.select().from(pendingQuestions).where(where).orderBy(desc(pendingQuestions.id)).all();
    return {
      items: rows.map((r) => {
        const application = ctx.db.select().from(applications).where(eq(applications.id, r.applicationId)).get();
        return { ...r, job: application ? jobSummary(ctx, application.jobId) : null };
      }),
    };
  });

  app.post('/questions/:id/answer', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z.object({ answer: z.string().min(1), saveToProfile: z.boolean().default(true) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'answer is required' });
    const question = ctx.db.select().from(pendingQuestions).where(eq(pendingQuestions.id, id)).get();
    if (!question) return reply.code(404).send({ error: 'question not found' });
    ctx.db
      .update(pendingQuestions)
      .set({ status: 'answered', answer: body.data.answer, saveToProfile: body.data.saveToProfile, answeredAt: nowIso() })
      .where(eq(pendingQuestions.id, id))
      .run();
    if (body.data.saveToProfile) {
      ctx.store.addSavedAnswer(question.question, body.data.answer, question.applicationId);
    }
    ctx.activity({ actor: 'user', type: 'question', message: `answered: "${question.question.slice(0, 80)}"`, applicationId: question.applicationId });

    // When every open question of a needs_input application is resolved, resume submission.
    const remaining = ctx.db
      .select({ id: pendingQuestions.id })
      .from(pendingQuestions)
      .where(and(eq(pendingQuestions.applicationId, question.applicationId), eq(pendingQuestions.status, 'open')))
      .all();
    const application = ctx.db.select().from(applications).where(eq(applications.id, question.applicationId)).get();
    let resumed = false;
    if (remaining.length === 0 && application?.status === 'needs_input') {
      ctx.db.update(applications).set({ status: 'approved', updatedAt: nowIso() }).where(eq(applications.id, application.id)).run();
      addApplicationEvent(ctx, application.id, 'approved', 'all questions answered — retrying submission');
      void applyStep(ctx, { applicationId: application.id }).catch(() => {});
      resumed = true;
    }
    return { ok: true, resumed, remainingOpen: remaining.length };
  });

  app.post('/questions/:id/dismiss', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const question = ctx.db.select().from(pendingQuestions).where(eq(pendingQuestions.id, id)).get();
    if (!question) return reply.code(404).send({ error: 'question not found' });
    ctx.db.update(pendingQuestions).set({ status: 'dismissed', answeredAt: nowIso() }).where(eq(pendingQuestions.id, id)).run();
    if (question.required) {
      ctx.db
        .update(applications)
        .set({ status: 'needs_action', failureReason: 'a required application question was dismissed — submit manually', updatedAt: nowIso() })
        .where(eq(applications.id, question.applicationId))
        .run();
      addApplicationEvent(ctx, question.applicationId, 'needs_action', 'required question dismissed — manual submission needed');
    }
    return { ok: true };
  });
}
