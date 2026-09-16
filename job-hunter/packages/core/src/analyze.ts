import type { Llm, LlmUsage } from './llm/client';
import { ANALYZE_SYSTEM, analyzeUser, EXTRACT_PROFILE_SYSTEM, PROMPT_VERSION, type JobForLlm } from './llm/prompts';
import { JobAnalysisSchema, MasterProfileSchema, type JobAnalysis, type MasterProfile, type Settings } from './types';
import { truncate } from './util';

export interface AnalyzeResult {
  analysis: JobAnalysis;
  usage: LlmUsage;
  model: string;
  promptVersion: string;
}

export async function analyzeJob(
  llm: Llm,
  profile: MasterProfile,
  settings: Settings,
  job: JobForLlm,
): Promise<AnalyzeResult> {
  const { data, usage, model } = await llm.json({
    name: 'report_job_analysis',
    description: 'Report the structured match analysis of the job posting for this candidate.',
    schema: JobAnalysisSchema,
    system: ANALYZE_SYSTEM,
    user: analyzeUser(profile, settings, job),
    maxTokens: 2048,
  });
  return { analysis: data, usage, model, promptVersion: PROMPT_VERSION };
}

export interface ExtractProfileResult {
  profile: MasterProfile;
  usage: LlmUsage;
  model: string;
}

/** Parse pasted CV text into a structured Master Profile (no invention; unknowns stay empty). */
export async function extractProfileFromCv(llm: Llm, cvText: string): Promise<ExtractProfileResult> {
  const { data, usage, model } = await llm.json({
    name: 'report_master_profile',
    description: 'Report the structured Master Profile extracted from the CV text.',
    schema: MasterProfileSchema,
    system: EXTRACT_PROFILE_SYSTEM,
    user: `CV TEXT:\n${truncate(cvText, 24000)}`,
    maxTokens: 8192,
  });
  return { profile: data, usage, model };
}
