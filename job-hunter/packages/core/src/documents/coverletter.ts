import type { Llm, LlmUsage } from '../llm/client';
import { COVER_SYSTEM, coverUser, type JobForLlm } from '../llm/prompts';
import { CoverLetterSchema, type FactGuardReport, type JobAnalysis, type MasterProfile } from '../types';
import { factGuard } from './factguard';

export interface CoverLetterResult {
  /** null when generation could not pass the fact-guard — apply without a letter rather than with a fabricated one. */
  markdown: string | null;
  language: string;
  guard: FactGuardReport | null;
  usage: LlmUsage;
  model: string | null;
}

export async function generateCoverLetter(
  llm: Llm,
  profile: MasterProfile,
  job: JobForLlm,
  analysis: JobAnalysis | null,
): Promise<CoverLetterResult> {
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let model: string | null = null;
  let extra = '';
  let lastGuard: FactGuardReport | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await llm.json({
      name: 'report_cover_letter',
      description: 'Report the cover letter markdown body and its language.',
      schema: CoverLetterSchema,
      system: COVER_SYSTEM,
      user: coverUser(profile, job, analysis) + extra,
      maxTokens: 2048,
    });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    model = res.model;
    const guard = factGuard(profile, res.data.markdown, 'letter');
    lastGuard = guard;
    if (guard.ok) {
      return { markdown: res.data.markdown, language: res.data.language, guard, usage, model };
    }
    extra = `\n\nYOUR PREVIOUS LETTER FAILED FACT VERIFICATION with these violations:\n${guard.violations
      .map((v) => `- [${v.type}] ${v.detail}`)
      .join('\n')}\nRewrite it using only facts from the profile; drop any unsupported numbers or claims.`;
  }

  return { markdown: null, language: 'en', guard: lastGuard, usage, model };
}
