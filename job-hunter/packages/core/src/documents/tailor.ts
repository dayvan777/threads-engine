import type { Llm, LlmUsage } from '../llm/client';
import { TAILOR_SYSTEM, tailorUser, type JobForLlm } from '../llm/prompts';
import { renderMasterCvMd } from '../profile';
import { TailoredCvSchema, type FactGuardReport, type JobAnalysis, type MasterProfile } from '../types';
import { factGuard } from './factguard';

export interface TailorResult {
  markdown: string;
  emphasis: string[];
  guard: FactGuardReport;
  usedFallback: boolean;
  usage: LlmUsage;
  model: string | null;
}

/**
 * Generate a job-tailored CV. Output is fact-guarded; one repair retry, then
 * the deterministic Master CV render is used as a safe fallback so a broken
 * generation can never submit fabricated facts.
 */
export async function tailorCv(
  llm: Llm,
  profile: MasterProfile,
  job: JobForLlm,
  analysis: JobAnalysis | null,
): Promise<TailorResult> {
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let model: string | null = null;
  let extra = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await llm.json({
      name: 'report_tailored_cv',
      description: 'Report the tailored CV markdown and the emphasis choices made.',
      schema: TailoredCvSchema,
      system: TAILOR_SYSTEM,
      user: tailorUser(profile, job, analysis) + extra,
      maxTokens: 4096,
    });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    model = res.model;
    const guard = factGuard(profile, res.data.markdown, 'cv');
    if (guard.ok) {
      return { markdown: res.data.markdown, emphasis: res.data.emphasis, guard, usedFallback: false, usage, model };
    }
    extra = `\n\nYOUR PREVIOUS CV FAILED FACT VERIFICATION with these violations:\n${guard.violations
      .map((v) => `- [${v.type}] ${v.detail}`)
      .join('\n')}\nFix every violation. Use only facts present in the Master Profile, keep exact titles/companies/dates, and follow the format contract.`;
  }

  const fallback = renderMasterCvMd(profile);
  return {
    markdown: fallback,
    emphasis: [],
    guard: factGuard(profile, fallback, 'cv'),
    usedFallback: true,
    usage,
    model,
  };
}
