import {
  answerScreenerQuestion,
  type JobForLlm,
  type MasterProfile,
  type ScreenerQuestion,
  type Settings,
} from '@jobhunter/core';
import type { AppContext } from '../../context';

export interface PendingQ {
  question: string;
  fieldKey?: string;
  fieldType?: string;
  options?: string[];
  required: boolean;
}

export type ApplyResult =
  | { kind: 'submitted'; confirmation: string; answers: Record<string, string> }
  | { kind: 'needs_input'; questions: PendingQ[]; answers: Record<string, string> }
  | { kind: 'needs_action'; reason: string }
  | { kind: 'dry_run'; answers: Record<string, string> }
  | { kind: 'paused' }
  | { kind: 'failed'; reason: string };

export interface ApplyDeps {
  ctx: AppContext;
  profile: MasterProfile;
  settings: Settings;
  savedAnswers: Array<{ question: string; answer: string }>;
  job: JobForLlm;
  cvPdfPath: string;
  coverLetterMd: string | null;
  artifactsDir: string;
  dryRun: boolean;
}

/** A form question discovered on the page, with a callback that fills it. */
export interface DiscoveredField {
  q: ScreenerQuestion;
  fill: (answer: string) => Promise<boolean>;
}

export const MIN_AUTO_CONFIDENCE = 0.75;

export function cleanLabel(raw: string): string {
  return raw
    .replace(/[✱*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeOption(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function matchOption(options: string[], answer: string): string | null {
  const na = normalizeOption(answer);
  const exact = options.find((o) => normalizeOption(o) === na);
  if (exact) return exact;
  const partial = options.find(
    (o) => normalizeOption(o).includes(na) || na.includes(normalizeOption(o)),
  );
  return partial ?? null;
}

export interface ResolveOutcome {
  answers: Record<string, string>;
  pending: PendingQ[];
}

/**
 * For each discovered form question: reuse saved answers or ask the LLM
 * (profile facts only). Confident answers are filled; anything required that
 * cannot be answered safely becomes a pending question (→ Needs Input).
 */
export async function resolveAndFill(deps: ApplyDeps, fields: DiscoveredField[]): Promise<ResolveOutcome> {
  const answers: Record<string, string> = {};
  const pending: PendingQ[] = [];
  const llm = deps.ctx.llm();

  for (const field of fields) {
    if (deps.ctx.paused()) break;
    const res = await answerScreenerQuestion(
      llm,
      {
        profile: deps.profile,
        settings: deps.settings,
        savedAnswers: deps.savedAnswers,
        job: deps.job,
      },
      field.q,
    );
    const usable =
      res.status === 'answered' && res.answer !== null && res.confidence >= MIN_AUTO_CONFIDENCE;
    if (usable) {
      const ok = await field.fill(res.answer as string);
      if (ok) {
        answers[field.q.question] = res.answer as string;
        continue;
      }
    }
    if (field.q.required) {
      pending.push({
        question: field.q.question,
        fieldKey: field.q.fieldKey,
        fieldType: field.q.fieldType,
        options: field.q.options,
        required: true,
      });
    }
  }
  return { answers, pending };
}
