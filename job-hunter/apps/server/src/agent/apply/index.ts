import path from 'node:path';
import { renderPdf } from '@jobhunter/core';
import { applications, documents, jobs, nowIso, pendingQuestions } from '@jobhunter/db';
import { and, eq, like, sql } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { jobRowToLlm } from '../analyze';
import { addApplicationEvent } from '../decide';
import { applyGreenhouse, matchesGreenhouse } from './greenhouse';
import { applyLever, matchesLever } from './lever';
import type { ApplyDeps, ApplyResult } from './form';

export interface ApplyStats {
  attempted: number;
  submitted: number;
  needsInput: number;
  needsAction: number;
  failed: number;
}

const APPLY_BATCH = 2;

interface Adapter {
  method: string;
  matches: (url: string) => boolean;
  apply: (jobUrl: string, deps: ApplyDeps) => Promise<ApplyResult>;
}

const ADAPTERS: Adapter[] = [
  { method: 'auto_greenhouse', matches: matchesGreenhouse, apply: applyGreenhouse },
  { method: 'auto_lever', matches: matchesLever, apply: applyLever },
];

export function detectAdapter(url: string): Adapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}

function submittedToday(ctx: AppContext): number {
  const today = new Date().toISOString().slice(0, 10);
  return (
    ctx.db
      .select({ c: sql<number>`count(*)` })
      .from(applications)
      .where(like(applications.submittedAt, `${today}%`))
      .get()?.c ?? 0
  );
}

function setStatus(ctx: AppContext, appId: number, status: string, extra: Record<string, unknown> = {}): void {
  ctx.db
    .update(applications)
    .set({ status, updatedAt: nowIso(), ...extra })
    .where(eq(applications.id, appId))
    .run();
}

/** Saved answers usable for this application: global answer bank + already-answered questions of this app. */
function savedAnswersFor(ctx: AppContext, applicationId: number): Array<{ question: string; answer: string }> {
  const global = ctx.store.getSavedAnswers();
  const local = ctx.db
    .select({ question: pendingQuestions.question, answer: pendingQuestions.answer })
    .from(pendingQuestions)
    .where(and(eq(pendingQuestions.applicationId, applicationId), eq(pendingQuestions.status, 'answered')))
    .all()
    .filter((r): r is { question: string; answer: string } => r.answer !== null);
  return [...local, ...global];
}

/** Applier worker: submit approved applications through allowlisted ATS adapters. */
export async function applyStep(ctx: AppContext, opts: { applicationId?: number } = {}): Promise<ApplyStats> {
  const stats: ApplyStats = { attempted: 0, submitted: 0, needsInput: 0, needsAction: 0, failed: 0 };
  if (!ctx.config.applyEnabled) return stats;
  const settings = ctx.store.getSettings();
  const profile = ctx.store.getProfile();

  const approved =
    opts.applicationId !== undefined
      ? ctx.db.select().from(applications).where(eq(applications.id, opts.applicationId)).all()
      : ctx.db.select().from(applications).where(eq(applications.status, 'approved')).limit(APPLY_BATCH).all();

  for (const app of approved) {
    if (ctx.paused()) break;
    // Re-check the live status: a user action or a concurrent cycle may have advanced it.
    const fresh = ctx.db.select({ status: applications.status }).from(applications).where(eq(applications.id, app.id)).get();
    if (!fresh || fresh.status !== 'approved') continue;
    if (submittedToday(ctx) >= settings.maxApplicationsPerDay) {
      ctx.activity({
        actor: 'agent',
        type: 'apply',
        message: `daily application cap (${settings.maxApplicationsPerDay}) reached — postponing remaining submissions`,
      });
      break;
    }
    const job = ctx.db.select().from(jobs).where(eq(jobs.id, app.jobId)).get();
    if (!job) continue;

    const adapter = detectAdapter(job.url);
    if (!adapter) {
      setStatus(ctx, app.id, 'needs_action', { failureReason: 'unsupported ATS — submit manually with the prepared documents' });
      addApplicationEvent(ctx, app.id, 'needs_action', 'no automation adapter for this site; documents are ready for manual submission');
      ctx.activity({
        actor: 'agent',
        type: 'apply',
        message: `"${job.title}" at ${job.company}: no automation for this site — marked Needs Action with documents ready`,
        jobId: job.id,
        applicationId: app.id,
      });
      stats.needsAction++;
      continue;
    }

    // CV PDF is mandatory for uploads.
    const cvDoc = app.cvDocumentId
      ? ctx.db.select().from(documents).where(eq(documents.id, app.cvDocumentId)).get()
      : undefined;
    if (!cvDoc) {
      setStatus(ctx, app.id, 'failed', { failureReason: 'CV document missing' });
      addApplicationEvent(ctx, app.id, 'failed', 'CV document missing');
      stats.failed++;
      continue;
    }
    let cvPdfPath = cvDoc.pdfPath;
    if (!cvPdfPath) {
      try {
        cvPdfPath = await renderPdf(
          cvDoc.contentMd,
          path.join(ctx.config.dataDir, 'documents', `app_${app.id}`, 'cv.pdf'),
          { title: `CV — ${profile.fullName}`, kind: 'cv' },
        );
        ctx.db.update(documents).set({ pdfPath: cvPdfPath }).where(eq(documents.id, cvDoc.id)).run();
      } catch (err) {
        setStatus(ctx, app.id, 'needs_action', { failureReason: `CV PDF could not be rendered: ${(err as Error).message}` });
        addApplicationEvent(ctx, app.id, 'needs_action', 'CV PDF could not be rendered');
        stats.needsAction++;
        continue;
      }
    }
    const letterDoc = app.coverLetterDocumentId
      ? ctx.db.select().from(documents).where(eq(documents.id, app.coverLetterDocumentId)).get()
      : undefined;

    const artifactsDir = path.join(ctx.config.dataDir, 'artifacts', `app_${app.id}`);
    setStatus(ctx, app.id, 'applying', { method: adapter.method, artifactsDir });
    addApplicationEvent(ctx, app.id, 'applying', `starting automated submission via ${adapter.method}`);
    stats.attempted++;

    const result = await adapter.apply(job.url, {
      ctx,
      profile,
      settings,
      savedAnswers: savedAnswersFor(ctx, app.id),
      job: jobRowToLlm(job),
      cvPdfPath,
      coverLetterMd: letterDoc?.contentMd ?? null,
      artifactsDir,
      dryRun: false,
    });

    switch (result.kind) {
      case 'submitted': {
        setStatus(ctx, app.id, 'submitted', {
          submittedAt: nowIso(),
          answers: result.answers,
          failureReason: null,
        });
        addApplicationEvent(ctx, app.id, 'submitted', `application submitted — ${result.confirmation}`, {
          confirmation: result.confirmation,
        });
        ctx.activity({
          actor: 'agent',
          type: 'apply',
          message: `application submitted: "${job.title}" at ${job.company}`,
          jobId: job.id,
          applicationId: app.id,
        });
        stats.submitted++;
        break;
      }
      case 'needs_input': {
        const now = nowIso();
        for (const q of result.questions) {
          ctx.db
            .insert(pendingQuestions)
            .values({
              applicationId: app.id,
              question: q.question,
              fieldKey: q.fieldKey ?? null,
              fieldType: q.fieldType ?? null,
              options: q.options ?? null,
              required: q.required,
              status: 'open',
              createdAt: now,
            })
            .run();
        }
        setStatus(ctx, app.id, 'needs_input', { answers: result.answers });
        addApplicationEvent(ctx, app.id, 'needs_input', `blocked: ${result.questions.length} question(s) need your input`);
        ctx.activity({
          actor: 'agent',
          type: 'apply',
          message: `application blocked for "${job.title}" at ${job.company}: ${result.questions.length} question(s) need your input`,
          jobId: job.id,
          applicationId: app.id,
        });
        stats.needsInput++;
        break;
      }
      case 'needs_action': {
        setStatus(ctx, app.id, 'needs_action', { failureReason: result.reason });
        addApplicationEvent(ctx, app.id, 'needs_action', result.reason);
        ctx.activity({
          actor: 'agent',
          type: 'apply',
          message: `needs action for "${job.title}" at ${job.company}: ${result.reason}`,
          jobId: job.id,
          applicationId: app.id,
        });
        stats.needsAction++;
        break;
      }
      case 'paused': {
        setStatus(ctx, app.id, 'approved');
        addApplicationEvent(ctx, app.id, 'paused', 'agent paused before submission — will retry when resumed');
        break;
      }
      case 'dry_run': {
        setStatus(ctx, app.id, 'ready_for_review', { answers: result.answers });
        addApplicationEvent(ctx, app.id, 'dry_run', 'dry run completed (form filled, not submitted)');
        break;
      }
      case 'failed': {
        setStatus(ctx, app.id, 'failed', { failureReason: result.reason });
        addApplicationEvent(ctx, app.id, 'failed', `automation error: ${result.reason}`);
        ctx.activity({
          actor: 'agent',
          type: 'apply_error',
          message: `submission failed for "${job.title}" at ${job.company}: ${result.reason}`,
          jobId: job.id,
          applicationId: app.id,
        });
        stats.failed++;
        break;
      }
    }
  }
  return stats;
}
