import { z } from "zod";
import type { SurveyQuestionType } from "@prisma/client";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { conflict, gone, notFound, ruleViolation } from "@/server/lib/errors";

// Feedback & surveys - doc 03 §10.

export const feedbackBody = z.object({
  kind: z.enum(["BUG", "CONTENT_ERROR", "SUGGESTION", "PRAISE", "OTHER"]),
  body: z.string().trim().min(5).max(2000),
  screenPath: z.string().max(200).optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  screenshotUrl: z.string().url().max(500).optional(),
  appVersion: z.string().max(40).optional(),
});

export async function createFeedback(
  userId: string | null,
  input: z.infer<typeof feedbackBody>,
  now: Date,
) {
  const row = await prisma.feedback.create({
    data: { id: uuidv7(), userId, ...input, createdAt: now },
    select: { id: true },
  });
  return { id: row.id };
}

// ── Surveys ──────────────────────────────────────────────────────────────────

interface Audience {
  minLessons?: number;
  provinces?: string[];
  authedOnly?: boolean;
}

function isOpen(s: { status: string; opensAt: Date | null; closesAt: Date | null }, now: Date) {
  if (s.status !== "PUBLISHED") return false;
  if (s.opensAt && s.opensAt > now) return false;
  if (s.closesAt && s.closesAt <= now) return false;
  return true;
}

async function audienceMatches(audience: Audience | null, userId: string | null): Promise<boolean> {
  if (!audience) return true;
  if (audience.authedOnly && !userId) return false;
  if (audience.minLessons != null) {
    if (!userId) return false;
    const stats = await prisma.userStats.findUnique({
      where: { userId },
      select: { lessonsCompleted: true },
    });
    if ((stats?.lessonsCompleted ?? 0) < audience.minLessons) return false;
  }
  if (audience.provinces?.length) {
    if (!userId) return false;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { province: true } });
    if (!user?.province || !audience.provinces.includes(user.province)) return false;
  }
  return true;
}

function surveyDto(s: {
  id: string;
  slug: string;
  questions: Array<{ id: string; order: number; type: SurveyQuestionType; payload: unknown }>;
}) {
  return {
    id: s.id,
    slug: s.slug,
    questions: s.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => {
        const payload = (q.payload ?? {}) as { prompt?: string; [k: string]: unknown };
        const { prompt, ...rest } = payload;
        return { id: q.id, order: q.order, type: q.type, prompt: prompt ?? "", payload: rest };
      }),
  };
}

/** 10.2 - first open survey the caller matches and hasn't answered, or null. */
export async function activeSurvey(userId: string | null, now: Date) {
  const candidates = await prisma.survey.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ opensAt: null }, { opensAt: { lte: now } }],
      AND: [{ OR: [{ closesAt: null }, { closesAt: { gt: now } }] }],
    },
    include: { questions: true },
    orderBy: { createdAt: "asc" },
  });
  for (const s of candidates) {
    if (!(await audienceMatches(s.audience as Audience | null, userId))) continue;
    if (userId) {
      const answered = await prisma.surveyResponse.findFirst({
        where: { surveyId: s.id, userId },
        select: { id: true },
      });
      if (answered) continue;
    }
    return surveyDto(s);
  }
  return null;
}

/** 10.3 - 404 when the survey is missing or not currently open. */
export async function getSurvey(slug: string, now: Date) {
  const s = await prisma.survey.findUnique({ where: { slug }, include: { questions: true } });
  if (!s || !isOpen(s, now)) throw notFound("Survey");
  return surveyDto(s);
}

export const surveyResponseBody = z.object({
  answers: z
    .array(z.object({ questionId: z.string().min(1).max(64), value: z.unknown() }))
    .min(1)
    .max(50),
});

/** Value shape per question type - doc 03 §10.4. */
function validateAnswer(type: SurveyQuestionType, value: unknown, payload: unknown): string | null {
  const opts = ((payload as { options?: Array<{ key: string }> } | null)?.options ?? []).map(
    (o) => o.key,
  );
  switch (type) {
    case "NPS":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10
        ? null
        : "NPS answer must be an integer 0..10";
    case "RATING_1_5":
      return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
        ? null
        : "Rating must be an integer 1..5";
    case "SINGLE_CHOICE":
      return typeof value === "string" && (opts.length === 0 || opts.includes(value))
        ? null
        : "Answer must be one of the option keys";
    case "MULTI_CHOICE":
      return Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => typeof v === "string" && (opts.length === 0 || opts.includes(v)))
        ? null
        : "Answer must be a non-empty array of option keys";
    case "FREE_TEXT":
      return typeof value === "string" && value.length <= 1000
        ? null
        : "Free-text answer must be a string of at most 1000 characters";
    default:
      return "Unknown question type";
  }
}

export async function submitSurveyResponse(
  userId: string | null,
  slug: string,
  input: z.infer<typeof surveyResponseBody>,
  now: Date,
) {
  const survey = await prisma.survey.findUnique({ where: { slug }, include: { questions: true } });
  if (!survey) throw notFound("Survey");
  if (survey.status !== "PUBLISHED") throw notFound("Survey");
  if (survey.closesAt && survey.closesAt <= now) throw gone("Survey is closed");
  if (survey.opensAt && survey.opensAt > now) throw notFound("Survey");

  if (userId) {
    const existing = await prisma.surveyResponse.findFirst({
      where: { surveyId: survey.id, userId },
      select: { id: true },
    });
    if (existing) throw conflict("You have already responded to this survey");
  }

  const byId = new Map(survey.questions.map((q) => [q.id, q]));
  const details: Array<{ path: string; message: string }> = [];
  const seen = new Set<string>();
  for (const [i, a] of input.answers.entries()) {
    const q = byId.get(a.questionId);
    if (!q) {
      details.push({ path: `answers.${i}.questionId`, message: "Unknown question for this survey" });
      continue;
    }
    if (seen.has(a.questionId)) {
      details.push({ path: `answers.${i}.questionId`, message: "Duplicate answer for one question" });
      continue;
    }
    seen.add(a.questionId);
    const err = validateAnswer(q.type, a.value, q.payload);
    if (err) details.push({ path: `answers.${i}.value`, message: err });
  }
  if (details.length > 0) {
    throw ruleViolation("INVALID_ANSWERS", details.map((d) => d.message).join("; "));
  }

  const row = await prisma.surveyResponse.create({
    data: {
      id: uuidv7(),
      surveyId: survey.id,
      userId,
      answers: input.answers as object[],
      submittedAt: now,
    },
    select: { id: true },
  });
  return { id: row.id };
}
