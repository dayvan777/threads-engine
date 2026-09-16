import path from 'node:path';
import {
  generateCoverLetter,
  renderMasterCvMd,
  renderPdf,
  tailorCv,
  type JobAnalysis,
} from '@jobhunter/core';
import { applications, documents, jobAnalyses, jobs, nowIso } from '@jobhunter/db';
import { desc, eq } from 'drizzle-orm';
import type { AppContext } from '../context';
import { jobRowToLlm } from './analyze';
import { addApplicationEvent } from './decide';

export interface PrepareStats {
  prepared: number;
  readyForReview: number;
  approved: number;
  errors: number;
}

const PREPARE_BATCH = 3;

function setAppStatus(ctx: AppContext, appId: number, status: string, extra: Record<string, unknown> = {}): void {
  ctx.db
    .update(applications)
    .set({ status, updatedAt: nowIso(), ...extra })
    .where(eq(applications.id, appId))
    .run();
}

async function tryRenderPdf(
  ctx: AppContext,
  markdown: string,
  file: string,
  opts: { title: string; kind: 'cv' | 'letter' },
): Promise<string | null> {
  try {
    return await renderPdf(markdown, file, opts);
  } catch (err) {
    ctx.activity({
      actor: 'system',
      type: 'warn',
      message: `PDF rendering unavailable (${(err as Error).message}); keeping markdown only`,
    });
    return null;
  }
}

/** Preparer worker: tailored CV + cover letter + fact-guard for queued applications. */
export async function prepareStep(
  ctx: AppContext,
  opts: { applicationId?: number } = {},
): Promise<PrepareStats> {
  const stats: PrepareStats = { prepared: 0, readyForReview: 0, approved: 0, errors: 0 };
  const profile = ctx.store.getProfile();

  const queued =
    opts.applicationId !== undefined
      ? ctx.db.select().from(applications).where(eq(applications.id, opts.applicationId)).all()
      : ctx.db.select().from(applications).where(eq(applications.status, 'queued')).limit(PREPARE_BATCH).all();

  for (const app of queued) {
    if (ctx.paused()) break;
    const job = ctx.db.select().from(jobs).where(eq(jobs.id, app.jobId)).get();
    if (!job) continue;
    const analysisRow = ctx.db
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.jobId, job.id))
      .orderBy(desc(jobAnalyses.id))
      .limit(1)
      .get();
    const analysis = (analysisRow?.data ?? null) as JobAnalysis | null;
    const llm = ctx.llm();
    // Settings are re-read here so autonomy changes apply to in-flight items.
    const settings = ctx.store.getSettings();

    try {
      setAppStatus(ctx, app.id, 'preparing');
      addApplicationEvent(ctx, app.id, 'preparing', 'generating tailored documents');
      const docsDir = path.join(ctx.config.dataDir, 'documents', `app_${app.id}`);
      const now = nowIso();

      // --- CV ---
      let cvMd: string;
      let cvMeta: Record<string, unknown>;
      if (llm) {
        const tailored = await tailorCv(llm, profile, jobRowToLlm(job), analysis);
        cvMd = tailored.markdown;
        cvMeta = {
          emphasis: tailored.emphasis,
          factGuard: tailored.guard,
          usedFallback: tailored.usedFallback,
          model: tailored.model,
          usage: tailored.usage,
        };
        if (tailored.usedFallback) {
          ctx.activity({
            actor: 'agent',
            type: 'warn',
            message: `tailored CV failed fact verification twice for "${job.title}" — using master CV`,
            applicationId: app.id,
            jobId: job.id,
          });
        }
      } else {
        cvMd = renderMasterCvMd(profile);
        cvMeta = { usedFallback: true, reason: 'LLM not configured' };
      }
      const cvPdf = await tryRenderPdf(ctx, cvMd, path.join(docsDir, 'cv.pdf'), {
        title: `CV — ${profile.fullName}`,
        kind: 'cv',
      });
      const cvDoc = ctx.db
        .insert(documents)
        .values({
          kind: 'cv_tailored',
          jobId: job.id,
          applicationId: app.id,
          title: `CV for ${job.title} @ ${job.company}`,
          contentMd: cvMd,
          pdfPath: cvPdf,
          meta: cvMeta,
          createdAt: now,
        })
        .run();
      const cvDocId = Number(cvDoc.lastInsertRowid);

      // --- Cover letter ---
      let letterDocId: number | null = null;
      if (settings.coverLetterEnabled && llm) {
        const letter = await generateCoverLetter(llm, profile, jobRowToLlm(job), analysis);
        if (letter.markdown) {
          const letterPdf = await tryRenderPdf(ctx, letter.markdown, path.join(docsDir, 'cover-letter.pdf'), {
            title: `Cover letter — ${job.company}`,
            kind: 'letter',
          });
          const letterDoc = ctx.db
            .insert(documents)
            .values({
              kind: 'cover_letter',
              jobId: job.id,
              applicationId: app.id,
              title: `Cover letter for ${job.title} @ ${job.company}`,
              contentMd: letter.markdown,
              pdfPath: letterPdf,
              meta: { language: letter.language, factGuard: letter.guard, model: letter.model, usage: letter.usage },
              createdAt: now,
            })
            .run();
          letterDocId = Number(letterDoc.lastInsertRowid);
        } else {
          ctx.activity({
            actor: 'agent',
            type: 'warn',
            message: `cover letter failed fact verification for "${job.title}" at ${job.company} — applying without letter`,
            applicationId: app.id,
            jobId: job.id,
          });
        }
      }

      const goAuto = app.intent === 'auto_apply' && settings.autonomy === 'autonomous' && llm !== null;
      const nextStatus = goAuto ? 'approved' : 'ready_for_review';
      setAppStatus(ctx, app.id, nextStatus, {
        cvDocumentId: cvDocId,
        coverLetterDocumentId: letterDocId,
      });
      addApplicationEvent(
        ctx,
        app.id,
        nextStatus,
        goAuto ? 'documents ready — approved for automatic submission' : 'documents ready — waiting for your review',
      );
      stats.prepared++;
      if (goAuto) stats.approved++;
      else stats.readyForReview++;
      ctx.activity({
        actor: 'agent',
        type: 'prepare',
        message: `generated tailored CV${letterDocId ? ' + cover letter' : ''} for "${job.title}" at ${job.company}`,
        jobId: job.id,
        applicationId: app.id,
      });
    } catch (err) {
      stats.errors++;
      setAppStatus(ctx, app.id, 'failed', { failureReason: `prepare: ${(err as Error).message}` });
      addApplicationEvent(ctx, app.id, 'failed', `document preparation failed: ${(err as Error).message}`);
      ctx.activity({
        actor: 'agent',
        type: 'prepare_error',
        message: `document preparation failed for application #${app.id}: ${(err as Error).message}`,
        applicationId: app.id,
        jobId: job.id,
      });
    }
  }
  return stats;
}
