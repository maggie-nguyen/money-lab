import { prisma } from "@/server/db";
import { notFound } from "@/server/lib/errors";
import type { Locale, Prisma } from "@prisma/client";

// Catalog reads - doc 03 §3. Only PUBLISHED content; locale fallback en→vi;
// LessonDetail strips answerKey from CHECK_QUESTION blocks (verified by test).

type Tr<T extends { locale: Locale }> = T[];

function pickTr<T extends { locale: Locale }>(trs: Tr<T>, locale: Locale): { tr: T; resolvedLocale: Locale } {
  const exact = trs.find((t) => t.locale === locale);
  if (exact) return { tr: exact, resolvedLocale: locale };
  const vi = trs.find((t) => t.locale === "vi");
  if (vi) return { tr: vi, resolvedLocale: "vi" };
  if (trs[0]) return { tr: trs[0], resolvedLocale: trs[0].locale };
  throw notFound("Translation");
}

const byIdOrSlug = (idOrSlug: string): Prisma.CourseWhereInput =>
  ({ OR: [{ id: idOrSlug }, { slug: idOrSlug }] }) as Prisma.CourseWhereInput;

export async function listTracks(locale: Locale) {
  const tracks = await prisma.track.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { order: "asc" },
    include: {
      translations: true,
      courses: { where: { status: "PUBLISHED" }, select: { id: true } },
    },
  });
  return tracks.map((t) => {
    const { tr, resolvedLocale } = pickTr(t.translations, locale);
    return {
      id: t.id,
      slug: t.slug,
      title: tr.title,
      subtitle: tr.subtitle,
      iconKey: t.iconKey,
      order: t.order,
      courseCount: t.courses.length,
      resolvedLocale,
    };
  });
}

async function courseSummary(
  course: Prisma.CourseGetPayload<{
    include: { translations: true; lessons: { select: { id: true; status: true } } };
  }>,
  locale: Locale,
  userId: string | null,
) {
  const { tr, resolvedLocale } = pickTr(course.translations, locale);
  const publishedLessons = course.lessons.filter((l) => l.status === "PUBLISHED");
  const base = {
    id: course.id,
    slug: course.slug,
    title: tr.title,
    subtitle: tr.subtitle,
    coverImageUrl: course.coverImageUrl,
    level: course.level,
    estimatedMinutes: course.estimatedMinutes,
    order: course.order,
    lessonCount: publishedLessons.length,
    xpReward: course.xpReward,
    resolvedLocale,
  };
  if (!userId) return base;
  const [enrollment, completed] = await Promise.all([
    prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
    }),
    prisma.lessonProgress.count({
      where: { userId, lessonId: { in: publishedLessons.map((l) => l.id) }, status: "COMPLETED" },
    }),
  ]);
  return {
    ...base,
    progress: {
      status: enrollment?.completedAt
        ? ("COMPLETED" as const)
        : enrollment
          ? ("IN_PROGRESS" as const)
          : ("NOT_STARTED" as const),
      completedLessons: completed,
    },
  };
}

export async function getTrack(idOrSlug: string, locale: Locale, userId: string | null) {
  const track = await prisma.track.findFirst({
    where: { status: "PUBLISHED", OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      translations: true,
      courses: {
        where: { status: "PUBLISHED" },
        orderBy: { order: "asc" },
        include: { translations: true, lessons: { select: { id: true, status: true } } },
      },
    },
  });
  if (!track) throw notFound("Track");
  const { tr, resolvedLocale } = pickTr(track.translations, locale);
  return {
    id: track.id,
    slug: track.slug,
    title: tr.title,
    subtitle: tr.subtitle,
    iconKey: track.iconKey,
    order: track.order,
    courseCount: track.courses.length,
    resolvedLocale,
    courses: await Promise.all(track.courses.map((c) => courseSummary(c, locale, userId))),
  };
}

interface LessonRow {
  id: string;
  slug: string;
  order: number;
  estimatedMinutes: number;
  xpReward: number;
  checkQuizId: string | null;
  moduleId: string | null;
  translations: { locale: Locale; title: string; summary: string; blocks: Prisma.JsonValue }[];
}

/**
 * What the syllabus row shows as a glyph. Derived from the blocks rather than
 * stored, so an editor who adds a video never has to remember a second field.
 */
function mediaOf(blocks: Prisma.JsonValue): { video: boolean; sim: boolean } {
  const list = Array.isArray(blocks) ? blocks : [];
  const has = (type: string) =>
    list.some((b) => b !== null && typeof b === "object" && (b as { type?: string }).type === type);
  return { video: has("VIDEO"), sim: has("SIM_LINK") };
}

async function lessonSummaries(lessons: LessonRow[], locale: Locale, userId: string | null) {
  const progressMap = new Map<string, { status: string; lastBlockIndex: number }>();
  if (userId && lessons.length > 0) {
    const rows = await prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessons.map((l) => l.id) } },
    });
    for (const r of rows) progressMap.set(r.lessonId, { status: r.status, lastBlockIndex: r.lastBlockIndex });
  }
  return lessons.map((l) => {
    const { tr } = pickTr(l.translations, locale);
    const p = progressMap.get(l.id);
    return {
      id: l.id,
      slug: l.slug,
      title: tr.title,
      order: l.order,
      estimatedMinutes: l.estimatedMinutes,
      xpReward: l.xpReward,
      hasCheckQuiz: l.checkQuizId !== null,
      media: mediaOf(tr.blocks),
      ...(userId ? { progress: p ?? { status: "NOT_STARTED", lastBlockIndex: 0 } } : {}),
    };
  });
}

export async function getCourse(idOrSlug: string, locale: Locale, userId: string | null) {
  const course = await prisma.course.findFirst({
    where: { status: "PUBLISHED", ...byIdOrSlug(idOrSlug) },
    include: {
      translations: true,
      lessons: {
        where: { status: "PUBLISHED" },
        orderBy: { order: "asc" },
        include: {
          translations: { select: { locale: true, title: true, summary: true, blocks: true } },
        },
      },
      modules: { orderBy: { order: "asc" }, include: { translations: true } },
      finalQuiz: { include: { questions: { select: { id: true } } } },
    },
  });
  if (!course) throw notFound("Course");
  const { tr, resolvedLocale } = pickTr(course.translations, locale);

  const allSummaries = await lessonSummaries(course.lessons, locale, userId);
  const byModule = new Map<string, typeof allSummaries>();
  const unmoduled: typeof allSummaries = [];
  course.lessons.forEach((l, i) => {
    const s = allSummaries[i]!;
    if (l.moduleId) {
      byModule.set(l.moduleId, [...(byModule.get(l.moduleId) ?? []), s]);
    } else {
      unmoduled.push(s);
    }
  });

  const summary = await courseSummary(
    { ...course, lessons: course.lessons.map((l) => ({ id: l.id, status: "PUBLISHED" as const })) },
    locale,
    userId,
  );
  return {
    ...summary,
    resolvedLocale,
    description: tr.description,
    learningObjectives: tr.learningObjectives,
    modules: course.modules.map((m) => ({
      id: m.id,
      slug: m.slug,
      title: pickTr(m.translations, locale).tr.title,
      order: m.order,
      lessons: byModule.get(m.id) ?? [],
    })),
    unmoduledLessons: unmoduled,
    finalQuiz: course.finalQuiz
      ? {
          id: course.finalQuiz.id,
          questionCount: course.finalQuiz.questions.length,
          passThresholdPct: course.finalQuiz.passThresholdPct,
        }
      : null,
  };
}

/**
 * Strip the server-only fields from CHECK_QUESTION blocks. The explanation goes
 * with the answer key: it names the right answer, so it is only returned once
 * the learner has submitted a response, by checkQuestionService.
 */
export function stripBlocks(blocks: unknown): unknown[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b) => {
    if (b && typeof b === "object" && (b as { type?: string }).type === "CHECK_QUESTION") {
      const block = b as { type: string; question?: Record<string, unknown> };
      if (block.question) {
        const { answerKey: _answerKey, explanation: _explanation, ...publicQ } = block.question;
        return { ...block, question: publicQ };
      }
    }
    return b;
  });
}

export async function getLesson(idOrSlug: string, locale: Locale, userId: string | null) {
  const lesson = await prisma.lesson.findFirst({
    where: { status: "PUBLISHED", OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      translations: true,
      checkQuiz: { include: { questions: { select: { id: true } } } },
      course: { select: { slug: true, translations: { select: { locale: true, title: true } } } },
    },
  });
  if (!lesson) throw notFound("Lesson");
  const { tr, resolvedLocale } = pickTr(lesson.translations, locale);
  void userId;

  // The reader needs to move through the course without going back to the
  // syllabus, so the neighbours travel with the lesson. Only published siblings
  // count, otherwise "next" could point at a lesson nobody is allowed to open.
  const siblings = await prisma.lesson.findMany({
    where: { courseId: lesson.courseId, status: "PUBLISHED" },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, slug: true, translations: { select: { locale: true, title: true } } },
  });
  const index = siblings.findIndex((s) => s.id === lesson.id);
  const neighbour = (offset: number) => {
    const s = index < 0 ? undefined : siblings[index + offset];
    return s ? { slug: s.slug, title: pickTr(s.translations, locale).tr.title } : null;
  };

  return {
    id: lesson.id,
    slug: lesson.slug,
    courseId: lesson.courseId,
    courseSlug: lesson.course.slug,
    courseTitle: pickTr(lesson.course.translations, locale).tr.title,
    position: index < 0 ? 1 : index + 1,
    lessonCount: siblings.length,
    prev: neighbour(-1),
    next: neighbour(1),
    title: tr.title,
    summary: tr.summary,
    estimatedMinutes: lesson.estimatedMinutes,
    xpReward: lesson.xpReward,
    contentVersion: lesson.contentVersion,
    blocks: stripBlocks(tr.blocks),
    checkQuiz: lesson.checkQuiz
      ? {
          id: lesson.checkQuiz.id,
          questionCount: lesson.checkQuiz.questions.length,
          passThresholdPct: lesson.checkQuiz.passThresholdPct,
        }
      : null,
    resolvedLocale,
  };
}

export async function search(q: string, locale: Locale, limit: number) {
  const term = q.trim();
  const [courses, lessons, sims] = await Promise.all([
    prisma.courseTranslation.findMany({
      where: {
        locale,
        course: { status: "PUBLISHED" },
        OR: [{ title: { contains: term, mode: "insensitive" } }, { subtitle: { contains: term, mode: "insensitive" } }],
      },
      include: { course: { select: { id: true, slug: true } } },
      take: limit,
    }),
    prisma.lessonTranslation.findMany({
      where: {
        locale,
        lesson: { status: "PUBLISHED" },
        OR: [{ title: { contains: term, mode: "insensitive" } }, { summary: { contains: term, mode: "insensitive" } }],
      },
      include: { lesson: { select: { id: true, slug: true } } },
      take: limit,
    }),
    prisma.simDefinitionTranslation.findMany({
      where: {
        locale,
        sim: { status: "PUBLISHED" },
        OR: [{ title: { contains: term, mode: "insensitive" } }, { subtitle: { contains: term, mode: "insensitive" } }],
      },
      include: { sim: { select: { id: true, slug: true } } },
      take: limit,
    }),
  ]);
  return [
    ...courses.map((c) => ({
      type: "course" as const,
      id: c.course.id,
      slug: c.course.slug,
      title: c.title,
      subtitle: c.subtitle,
    })),
    ...lessons.map((l) => ({
      type: "lesson" as const,
      id: l.lesson.id,
      slug: l.lesson.slug,
      title: l.title,
      subtitle: l.summary,
    })),
    ...sims.map((s) => ({
      type: "sim" as const,
      id: s.sim.id,
      slug: s.sim.slug,
      title: s.title,
      subtitle: s.subtitle,
    })),
  ].slice(0, limit);
}
