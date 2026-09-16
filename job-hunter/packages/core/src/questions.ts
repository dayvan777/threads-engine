import type { Llm } from './llm/client';
import { ANSWER_SYSTEM, answerUser, type AnswerContext } from './llm/prompts';
import { ScreenerAnswerSchema, type ScreenerAnswer, type ScreenerQuestion } from './types';
import { tokenize } from './util';

export interface SavedAnswer {
  question: string;
  answer: string;
}

/** Reuse a previously saved answer when the questions are near-identical (token Jaccard ≥ 0.75). */
export function findSavedAnswer(saved: SavedAnswer[], question: string): SavedAnswer | null {
  const qTokens = new Set(tokenize(question));
  if (qTokens.size === 0) return null;
  let best: SavedAnswer | null = null;
  let bestScore = 0;
  for (const s of saved) {
    const sTokens = new Set(tokenize(s.question));
    if (sTokens.size === 0) continue;
    let inter = 0;
    for (const t of qTokens) if (sTokens.has(t)) inter++;
    const union = qTokens.size + sTokens.size - inter;
    const score = union === 0 ? 0 : inter / union;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 0.75 ? best : null;
}

export type ScreenerAnswerWithSource = ScreenerAnswer & { source: 'saved' | 'llm' | 'unavailable' };

/**
 * Answer an application form question from profile facts only.
 * Escalation contract: anything not clearly derivable → status "needs_user"
 * (surfaces in the dashboard as a Needs Input item).
 */
export async function answerScreenerQuestion(
  llm: Llm | null,
  ctx: AnswerContext,
  question: ScreenerQuestion,
): Promise<ScreenerAnswerWithSource> {
  const saved = findSavedAnswer(ctx.savedAnswers, question.question);
  if (saved) {
    // For choice fields the saved free-text answer must actually be one of the options.
    const options = question.options ?? [];
    if (options.length === 0 || options.some((o) => o.trim().toLowerCase() === saved.answer.trim().toLowerCase())) {
      return { status: 'answered', answer: saved.answer, confidence: 1, reason: `reused saved answer for "${saved.question}"`, source: 'saved' };
    }
  }
  if (!llm) {
    return { status: 'needs_user', answer: null, confidence: 0, reason: 'LLM not configured', source: 'unavailable' };
  }
  const { data } = await llm.json({
    name: 'report_answer',
    description: 'Report the answer to the application form question, or needs_user.',
    schema: ScreenerAnswerSchema,
    system: ANSWER_SYSTEM,
    user: answerUser(ctx, question),
    maxTokens: 1024,
  });
  return { ...data, source: 'llm' };
}
