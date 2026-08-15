import type { Locale, Prisma, Question, QuizAttempt } from "@prisma/client";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { notFound, ruleViolation, conflict, AppError } from "@/server/lib/errors";
import { mulberry32, seedFromString, shuffle } from "@/server/lib/rng";
import { scoreQuestion, isValidResponseShape } from "@/server/lib/quizScoring";
import {
  emptyAwards,
  grantXp,
  touchStreak,
  bumpQuest,
  type Awards,
} from "@/server/services/gamificationService";
import type { Clock } from "@/server/lib/time";

// Quizzes - doc 03 §5. answerKey never leaves the server before submit.

function attemptDto(a: QuizAttempt, answers?: Array<{ questionId: string; response: unknown }>) {
  return {
    id: a.id,
    quizId: a.quizId,
    attemptNumber: a.attemptNumber,
    status: a.status,
    questionOrder: a.questionOrder as string[],
    startedAt: a.startedAt.toISOString(),
    expiresAt: a.expiresAt?.toISOString() ?? null,
    ...(answers ? { answers } : {}),
    ...(a.status === "SUBMITTED"
      ? {
          result: {
            scorePoints: a.scorePoints,
            maxPoints: a.maxPoints,
            scorePct: a.scorePct,
            passed: a.passed,
          },
        }
      : {}),
  };
}

/** QuestionPublic - payload with per-attempt seeded option shuffle; never answerKey. */
function questionPublic(q: Question & { translations: { locale: Locale; prompt: string; explanation: string; payloadText: unknown }[] }, attemptId: string, locale: Locale) {
  const tr = q.translations.find((t) => t.locale === locale) ?? q.translations[0];
  const payload = q.payload as Record<string, unknown>;
  const text = (tr?.payloadText ?? {}) as Record<string, unknown>;
  const rng = mulberry32(seedFromString(`${attemptId}:${q.id}`));

  const pub: Record<string, unknown> = {};
  if (Array.isArray(payload.options)) {
    pub.options = shuffle(payload.options as string[], rng);
    pub.optionsText = text.optionsText ?? {};
  }
  if (Array.isArray(payload.items)) {
    pub.items = shuffle(payload.items as string[], rng);
    pub.itemsText = text.itemsText ?? {};
  }
  if (Array.isArray(payload.left)) {
    pub.left = payload.left;
    pub.right = shuffle(payload.right as string[], rng);
    pub.leftText = text.leftText ?? {};
    pub.rightText = text.rightText ?? {};
  }
  if (payload.unit !== undefined) pub.unit = payload.unit;
  if (payload.inputHint !== undefined) pub.inputHint = payload.inputHint;
  if (text.scenarioMd !== undefined) pub.scenarioMd = text.scenarioMd;

  return {
    id: q.id,
    order: q.order,
    type: q.type,
    points: q.points,
    prompt: tr?.prompt ?? "",
    payload: pub,
  };
}

async function loadQuiz(quizId: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, status: "PUBLISHED" },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz) throw notFound("Quiz");
  return quiz;
}

/** Lazily expire an attempt whose time limit has passed. */
async function lazyExpire(attempt: QuizAttempt, now: Date): Promise<QuizAttempt> {
  if (attempt.status === "IN_PROGRESS" && attempt.expiresAt && attempt.expiresAt < now) {
    return prisma.quizAttempt.update({ where: { id: attempt.id }, data: { status: "EXPIRED" } });
  }
  return attempt;
}

export async function startAttempt(userId: string, quizId: string, now: Clock) {
  const quiz = await loadQuiz(quizId);
  const at = now();

  const existing = await prisma.quizAttempt.findFirst({
    where: { userId, quizId, status: "IN_PROGRESS" },
  });
  if (existing) {
    const still = await lazyExpire(existing, at);
    if (still.status === "IN_PROGRESS") {
      throw conflict("Bạn đã có một lượt làm bài đang diễn ra.", [
        { path: "attemptId", message: still.id },
      ]);
    }
  }

  const attemptCount = await prisma.quizAttempt.count({ where: { userId, quizId } });
  if (quiz.maxAttempts !== null && attemptCount >= quiz.maxAttempts) {
    throw ruleViolation("MAX_ATTEMPTS_REACHED");
  }

  const attemptId = uuidv7();
  let order = quiz.questions.map((q) => q.id);
  if (quiz.shuffleQuestions) {
    order = shuffle(order, mulberry32(seedFromString(attemptId)));
  }
  const attempt = await prisma.quizAttempt.create({
    data: {
      id: attemptId,
      userId,
      quizId,
      attemptNumber: attemptCount + 1,
      questionOrder: order,
      startedAt: at,
      expiresAt: quiz.timeLimitSec ? new Date(at.getTime() + quiz.timeLimitSec * 1000) : null,
      contentVersionSeen: quiz.contentVersion,
    },
  });
  return attemptDto(attempt, []);
}

export async function getAttempt(userId: string, quizId: string, attemptId: string, now: Clock, locale: Locale) {
  let attempt = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, quizId, userId },
    include: { answers: true },
  });
  if (!attempt) throw notFound("Attempt");
  attempt = { ...(await lazyExpire(attempt, now())), answers: attempt.answers };

  const questions = await prisma.question.findMany({
    where: { quizId },
    include: { translations: true },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ordered = (attempt.questionOrder as string[])
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q);

  return {
    ...attemptDto(
      attempt,
      attempt.answers.map((a) => ({ questionId: a.questionId, response: a.response })),
    ),
    questions: ordered.map((q) => questionPublic(q, attempt.id, locale)),
    ...(attempt.status === "SUBMITTED"
      ? {
          result: {
            scorePoints: attempt.scorePoints,
            maxPoints: attempt.maxPoints,
            scorePct: attempt.scorePct,
            passed: attempt.passed,
            perQuestion: attempt.answers.map((a) => {
              const q = byId.get(a.questionId);
              const tr = q?.translations.find((t) => t.locale === locale) ?? q?.translations[0];
              return {
                questionId: a.questionId,
                isCorrect: a.isCorrect,
                pointsAwarded: a.pointsAwarded,
                correctResponse: q?.answerKey ?? null,
                explanation: tr?.explanation ?? "",
              };
            }),
          },
        }
      : {}),
  };
}

export async function saveAnswer(
  userId: string,
  quizId: string,
  attemptId: string,
  questionId: string,
  response: unknown,
  now: Clock,
) {
  let attempt = await prisma.quizAttempt.findFirst({ where: { id: attemptId, quizId, userId } });
  if (!attempt) throw notFound("Attempt");
  attempt = await lazyExpire(attempt, now());
  if (attempt.status === "EXPIRED") throw ruleViolation("ATTEMPT_EXPIRED");
  if (attempt.status !== "IN_PROGRESS") throw ruleViolation("ATTEMPT_NOT_IN_PROGRESS");
  if (!(attempt.questionOrder as string[]).includes(questionId)) throw notFound("Question");

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw notFound("Question");
  if (!isValidResponseShape(question.type, response)) {
    throw new AppError("VALIDATION_ERROR", "Định dạng câu trả lời không phù hợp với loại câu hỏi.");
  }

  const existing = await prisma.quizAnswer.findFirst({ where: { attemptId, questionId } });
  if (existing) {
    await prisma.quizAnswer.update({
      where: { id: existing.id },
      data: { response: response as Prisma.InputJsonValue },
    });
  } else {
    await prisma.quizAnswer.create({
      data: {
        id: uuidv7(),
        attemptId,
        questionId,
        response: response as Prisma.InputJsonValue,
      },
    });
  }
  return { saved: true };
}

export async function submitAttempt(userId: string, quizId: string, attemptId: string, now: Clock) {
  const at = now();
  const acc: Awards = emptyAwards();

  const result = await prisma.$transaction(async (tx) => {
    const attempt = await tx.quizAttempt.findFirst({
      where: { id: attemptId, quizId, userId },
      include: { answers: true },
    });
    if (!attempt) throw notFound("Attempt");
    if (attempt.status !== "IN_PROGRESS") throw ruleViolation("ATTEMPT_NOT_IN_PROGRESS");
    // Grace: allow submit up to 30s past expiry (network slack); else expire
    if (attempt.expiresAt && at.getTime() > attempt.expiresAt.getTime() + 30_000) {
      await tx.quizAttempt.update({ where: { id: attempt.id }, data: { status: "EXPIRED" } });
      throw ruleViolation("ATTEMPT_EXPIRED");
    }

    const quiz = await tx.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });
    if (!quiz) throw notFound("Quiz");

    const answerByQ = new Map(attempt.answers.map((a) => [a.questionId, a]));
    let scorePoints = 0;
    let maxPoints = 0;
    for (const q of quiz.questions) {
      maxPoints += q.points;
      const answer = answerByQ.get(q.id);
      const score = scoreQuestion(
        q.type,
        q.answerKey as Record<string, unknown>,
        (answer?.response as Record<string, unknown>) ?? null,
        q.points,
      );
      scorePoints += score.pointsAwarded;
      if (answer) {
        await tx.quizAnswer.update({
          where: { id: answer.id },
          data: { isCorrect: score.isCorrect, pointsAwarded: score.pointsAwarded },
        });
      }
    }
    const scorePct = maxPoints > 0 ? Math.floor((scorePoints / maxPoints) * 100) : 0;
    const passed = scorePct >= quiz.passThresholdPct;

    const updated = await tx.quizAttempt.update({
      where: { id: attempt.id },
      data: { status: "SUBMITTED", submittedAt: at, scorePoints, maxPoints, scorePct, passed },
    });

    if (passed) {
      const granted = await grantXp(tx, userId, 30, "QUIZ_PASS", "quiz", quizId, at, acc);
      if (granted > 0) {
        await tx.userStats.update({
          where: { userId },
          data: { quizzesPassed: { increment: 1 } },
        });
      }
      if (scorePct === 100) {
        await grantXp(tx, userId, 20, "QUIZ_PERFECT", "quiz", quizId, at, acc);
      }
      await touchStreak(tx, userId, at, acc);
      await bumpQuest(tx, userId, "q_earn_xp_50", acc.xp, at, acc);
    }
    return updated;
  });

  return { attempt: attemptDto(result), awards: acc };
}

export async function listMyAttempts(userId: string, quizId: string) {
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, quizId },
    orderBy: { attemptNumber: "desc" },
  });
  return attempts.map((a) => attemptDto(a));
}
