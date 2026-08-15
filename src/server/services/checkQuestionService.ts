/**
 * Inline lesson check questions (doc 05 §3, block type CHECK_QUESTION).
 *
 * These are formative, not graded: nothing is stored, no XP is granted, and a
 * learner may answer as many times as they like. The answer key never leaves
 * the server until the learner has submitted a response, which is why this
 * lives behind an endpoint instead of shipping with the lesson payload.
 */
import { prisma } from "@/server/db";
import { AppError, notFound } from "@/server/lib/errors";
import { isValidResponseShape, scoreQuestion } from "@/server/lib/quizScoring";

interface CheckQuestionBlock {
  type: string;
  question?: {
    id?: string;
    type?: string;
    answerKey?: Record<string, unknown>;
    explanation?: string | null;
  };
}

export interface CheckQuestionResult {
  questionId: string;
  isCorrect: boolean;
  correctResponse: Record<string, unknown>;
  explanation: string | null;
}

export async function checkLessonQuestion(
  lessonIdOrSlug: string,
  questionId: string,
  response: Record<string, unknown>,
): Promise<CheckQuestionResult> {
  const lesson = await prisma.lesson.findFirst({
    where: { status: "PUBLISHED", OR: [{ id: lessonIdOrSlug }, { slug: lessonIdOrSlug }] },
    include: { translations: true },
  });
  if (!lesson) throw notFound("Lesson");

  // The answer key lives in the authored blocks, which are identical across
  // translations, so the first translation carrying blocks is enough.
  let found: CheckQuestionBlock["question"] | null = null;
  for (const tr of lesson.translations) {
    const blocks = Array.isArray(tr.blocks) ? (tr.blocks as unknown[]) : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const block = b as CheckQuestionBlock;
      if (block.type !== "CHECK_QUESTION" || !block.question) continue;
      if (block.question.id === questionId) {
        found = block.question;
        break;
      }
    }
    if (found) break;
  }
  if (!found || !found.type || !found.answerKey) throw notFound("Check question");

  if (!isValidResponseShape(found.type, response)) {
    throw new AppError("VALIDATION_ERROR", "Định dạng câu trả lời không hợp lệ", {
      details: [{ path: "body.response", message: "BAD_RESPONSE_SHAPE" }],
    });
  }

  const scored = scoreQuestion(found.type, found.answerKey, response, 1);
  return {
    questionId,
    isCorrect: scored.isCorrect,
    correctResponse: found.answerKey,
    explanation: found.explanation ?? null,
  };
}
