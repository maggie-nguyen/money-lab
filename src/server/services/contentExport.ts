import { prisma } from "@/server/db";
import { AppError, notFound } from "@/server/lib/errors";

// GET /admin/export?scope= - doc 03 §14.2. Rebuilds doc 05 bundle JSON from the DB,
// the exact inverse of contentImport: payload/answerKey columns spread back into the
// authoring shape, payloadText merged back into each locale's i18n entry.

type Json = Record<string, unknown>;

function exportQuestion(q: {
  type: string;
  points: number;
  payload: unknown;
  answerKey: unknown;
  translations: Array<{ locale: string; prompt: string; explanation: string; payloadText: unknown }>;
}): Json {
  const i18n: Json = {};
  for (const t of q.translations) {
    i18n[t.locale] = {
      prompt: t.prompt,
      ...(t.explanation ? { explanation: t.explanation } : {}),
      ...((t.payloadText ?? {}) as Json),
    };
  }
  const payload = (q.payload ?? {}) as Json;
  // NUMERIC stores unit/inputHint as explicit nulls - drop them on export when unset.
  const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null));
  return { type: q.type, points: q.points, ...cleaned, answerKey: q.answerKey, i18n };
}

async function exportQuiz(quizId: string): Promise<Json | null> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: { order: "asc" }, include: { translations: true } } },
  });
  if (!quiz) return null;
  return {
    kind: quiz.kind,
    passThresholdPct: quiz.passThresholdPct,
    maxAttempts: quiz.maxAttempts,
    timeLimitSec: quiz.timeLimitSec,
    shuffleQuestions: quiz.shuffleQuestions,
    questions: quiz.questions.map(exportQuestion),
  };
}

async function exportCourseBundle(courseId: string): Promise<Json> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    include: {
      track: { include: { translations: true } },
      translations: true,
      modules: { orderBy: { order: "asc" }, include: { translations: true } },
      lessons: { orderBy: { order: "asc" }, include: { translations: true } },
    },
  });
  const moduleSlugById = new Map(course.modules.map((m) => [m.id, m.slug]));

  const lessons = await Promise.all(
    course.lessons.map(async (l) => {
      const i18n: Json = {};
      for (const t of l.translations) {
        i18n[t.locale] = { title: t.title, summary: t.summary, blocks: t.blocks };
      }
      return {
        slug: l.slug,
        order: l.order,
        moduleSlug: l.moduleId ? (moduleSlugById.get(l.moduleId) ?? null) : null,
        estimatedMinutes: l.estimatedMinutes,
        xpReward: l.xpReward,
        i18n,
        checkQuiz: l.checkQuizId ? await exportQuiz(l.checkQuizId) : null,
      };
    }),
  );

  const trackI18n: Json = {};
  for (const t of course.track.translations) {
    trackI18n[t.locale] = { title: t.title, subtitle: t.subtitle, description: t.description };
  }
  const courseI18n: Json = {};
  for (const t of course.translations) {
    courseI18n[t.locale] = {
      title: t.title,
      subtitle: t.subtitle,
      description: t.description,
      learningObjectives: t.learningObjectives,
    };
  }

  return {
    $schema: "moneylab-content-v1",
    track: {
      slug: course.track.slug,
      order: course.track.order,
      ...(course.track.iconKey ? { iconKey: course.track.iconKey } : {}),
      i18n: trackI18n,
    },
    course: {
      slug: course.slug,
      order: course.order,
      level: course.level,
      estimatedMinutes: course.estimatedMinutes,
      xpReward: course.xpReward,
      ...(course.coverImageUrl ? { coverImageUrl: course.coverImageUrl } : {}),
      i18n: courseI18n,
      modules: course.modules.map((m) => {
        const i18n: Json = {};
        for (const t of m.translations) i18n[t.locale] = { title: t.title };
        return { slug: m.slug, order: m.order, i18n };
      }),
      lessons,
      finalQuiz: course.finalQuizId ? await exportQuiz(course.finalQuizId) : null,
    },
  };
}

/** scope = `all` | `track:{slug}` | `course:{slug}` → `{ bundles: [...] }` (one per course). */
export async function exportBundles(scope: string): Promise<{ scope: string; bundles: Json[] }> {
  let courseIds: string[];
  if (scope === "all") {
    const courses = await prisma.course.findMany({ select: { id: true }, orderBy: { order: "asc" } });
    courseIds = courses.map((c) => c.id);
  } else if (scope.startsWith("track:")) {
    const track = await prisma.track.findUnique({
      where: { slug: scope.slice("track:".length) },
      include: { courses: { select: { id: true }, orderBy: { order: "asc" } } },
    });
    if (!track) throw notFound("Track");
    courseIds = track.courses.map((c) => c.id);
  } else if (scope.startsWith("course:")) {
    const course = await prisma.course.findUnique({ where: { slug: scope.slice("course:".length) } });
    if (!course) throw notFound("Course");
    courseIds = [course.id];
  } else {
    throw new AppError("VALIDATION_ERROR", "scope must be all | track:{slug} | course:{slug}");
  }
  const bundles: Json[] = [];
  for (const id of courseIds) bundles.push(await exportCourseBundle(id));
  return { scope, bundles };
}
