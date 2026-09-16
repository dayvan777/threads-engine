import { analyzeJob, prefilter, type JobForLlm } from '@jobhunter/core';
import { jobAnalyses, jobs, nowIso } from '@jobhunter/db';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../context';

export interface AnalyzeStats {
  prefiltered: number;
  analyzed: number;
  qualified: number;
  errors: number;
  llmUnavailable?: boolean;
}

type JobRow = typeof jobs.$inferSelect;

export function jobRowToLlm(job: JobRow): JobForLlm {
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    remoteMode: job.remoteMode,
    description: job.description,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryRaw: job.salaryRaw,
    postedAt: job.postedAt,
    url: job.url,
  };
}

/** Analyst worker: cheap deterministic prefilter, then LLM match scoring. */
export async function analyzeStep(
  ctx: AppContext,
  opts: { jobId?: number } = {},
): Promise<AnalyzeStats> {
  const stats: AnalyzeStats = { prefiltered: 0, analyzed: 0, qualified: 0, errors: 0 };
  const settings = ctx.store.getSettings();
  const profile = ctx.store.getProfile();

  const found =
    opts.jobId !== undefined
      ? ctx.db.select().from(jobs).where(eq(jobs.id, opts.jobId)).all()
      : ctx.db.select().from(jobs).where(eq(jobs.status, 'found')).all();

  // 1. Deterministic prefilter — free, runs for everything.
  const survivors: Array<{ job: JobRow; relevance: number }> = [];
  for (const job of found) {
    const res = prefilter(job, settings);
    if (!res.pass && opts.jobId === undefined) {
      stats.prefiltered++;
      ctx.db
        .update(jobs)
        .set({ status: 'skipped_prefilter', skipReason: res.reason })
        .where(eq(jobs.id, job.id))
        .run();
    } else {
      survivors.push({ job, relevance: res.relevance });
    }
  }
  if (stats.prefiltered > 0) {
    ctx.activity({
      actor: 'agent',
      type: 'prefilter',
      message: `rejected ${stats.prefiltered} of ${found.length} new jobs by hard filters`,
    });
  }

  // 2. LLM scoring, most relevant first, bounded per cycle.
  const llm = ctx.llm();
  if (!llm) {
    if (survivors.length > 0) {
      stats.llmUnavailable = true;
      ctx.activity({
        actor: 'agent',
        type: 'warn',
        message: `${survivors.length} job(s) await analysis, but ANTHROPIC_API_KEY is not configured`,
      });
    }
    return stats;
  }

  survivors.sort((a, b) => b.relevance - a.relevance);
  const batch = survivors.slice(0, settings.maxAnalysesPerCycle);

  for (const { job } of batch) {
    if (ctx.paused()) break;
    try {
      const { analysis, usage, model, promptVersion } = await analyzeJob(
        llm,
        profile,
        settings,
        jobRowToLlm(job),
      );
      ctx.db
        .insert(jobAnalyses)
        .values({
          jobId: job.id,
          score: analysis.match_score,
          verdict: analysis.verdict,
          data: analysis,
          model,
          promptVersion,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          createdAt: nowIso(),
        })
        .run();
      const qualified = analysis.match_score >= settings.reviewThreshold;
      ctx.db
        .update(jobs)
        .set({ status: qualified ? 'qualified' : 'analyzed', skipReason: null })
        .where(eq(jobs.id, job.id))
        .run();
      stats.analyzed++;
      if (qualified) stats.qualified++;
      ctx.activity({
        actor: 'agent',
        type: 'analyze',
        message: `analyzed "${job.title}" at ${job.company}: ${analysis.match_score}/100 (${analysis.verdict})`,
        jobId: job.id,
        data: { score: analysis.match_score },
      });
    } catch (err) {
      stats.errors++;
      ctx.activity({
        actor: 'agent',
        type: 'analyze_error',
        message: `analysis failed for "${job.title}" at ${job.company}: ${(err as Error).message}`,
        jobId: job.id,
      });
      // Analysis errors are usually systemic (rate limit, auth) — stop the batch.
      break;
    }
  }
  return stats;
}
