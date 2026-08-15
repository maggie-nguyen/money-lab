import type { Locale } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";
import { uuidv7, certCode } from "@/server/lib/ids";
import { notFound, ruleViolation } from "@/server/lib/errors";
import type { Clock } from "@/server/lib/time";
import {
  emptyAwards,
  grantXp,
  touchStreak,
  bumpQuest,
  awardBadgeByCode,
  checkProgressBadges,
  type Awards,
} from "@/server/services/gamificationService";

// Enrollment + lesson progress - doc 03 §4.

function enrollmentDto(e: {
  id: string;
  courseId: string;
  startedAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: e.id,
    courseId: e.courseId,
    startedAt: e.startedAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? null,
  };
}

function progressDto(p: {
  id: string;
  lessonId: string;
  status: string;
  lastBlockIndex: number;
  secondsSpent: number;
  startedAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: p.id,
    lessonId: p.lessonId,
    status: p.status,
    lastBlockIndex: p.lastBlockIndex,
    secondsSpent: p.secondsSpent,
    startedAt: p.startedAt.toISOString(),
    completedAt: p.completedAt?.toISOString() ?? null,
  };
}

async function findPublishedCourse(courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
  });
  if (!course) throw notFound("Course");
  return course;
}

/** POST /courses/:id/enroll - idempotent: 201 first time, 200 after. */
export async function enroll(userId: string, courseId: string, now: Clock) {
  await findPublishedCourse(courseId);
  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (existing) return { enrollment: enrollmentDto(existing), created: false };
  const created = await prisma.enrollment.create({
    data: { id: uuidv7(), userId, courseId, startedAt: now() },
  });
  return { enrollment: enrollmentDto(created), created: true };
}

export async function listEnrollments(userId: string, locale: Locale) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    include: {
      course: {
        include: {
          translations: true,
          lessons: { where: { status: "PUBLISHED" }, select: { id: true } },
        },
      },
    },
  });
  const results = [];
  for (const e of enrollments) {
    const tr =
      e.course.translations.find((t) => t.locale === locale) ??
      e.course.translations.find((t) => t.locale === "vi") ??
      e.course.translations[0];
    const lessonIds = e.course.lessons.map((l) => l.id);
    const completed = await prisma.lessonProgress.count({
      where: { userId, lessonId: { in: lessonIds }, status: "COMPLETED" },
    });
    results.push({
      ...enrollmentDto(e),
      course: {
        id: e.course.id,
        slug: e.course.slug,
        title: tr?.title ?? e.course.slug,
        coverImageUrl: e.course.coverImageUrl,
        lessonCount: lessonIds.length,
        lessonsCompleted: completed,
      },
    });
  }
  return results;
}

async function findPublishedLesson(lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, status: "PUBLISHED" },
    include: { translations: true },
  });
  if (!lesson) throw notFound("Lesson");
  return lesson;
}

/** POST /lessons/:id/start - auto-enrolls in the course; idempotent. */
export async function startLesson(userId: string, lessonId: string, now: Clock) {
  const lesson = await findPublishedLesson(lessonId);
  const at = now();

  // Auto-enroll (idempotent)
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId: lesson.courseId } },
    create: { id: uuidv7(), userId, courseId: lesson.courseId, startedAt: at },
    update: {},
  });

  const progress = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: {
      id: uuidv7(),
      userId,
      lessonId,
      startedAt: at,
      contentVersionSeen: lesson.contentVersion,
    },
    update: {},
  });
  return progressDto(progress);
}

function blockCount(lesson: { translations: { locale: Locale; blocks: unknown }[] }): number {
  const tr = lesson.translations.find((t) => t.locale === "vi") ?? lesson.translations[0];
  const blocks = tr?.blocks;
  return Array.isArray(blocks) ? blocks.length : 0;
}

/** PATCH /lessons/:id/progress - monotonic lastBlockIndex; additive secondsSpent. */
export async function patchProgress(
  userId: string,
  lessonId: string,
  input: { lastBlockIndex?: number; secondsSpentDelta?: number },
  now: Clock,
) {
  const lesson = await findPublishedLesson(lessonId);
  const progress = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });
  if (!progress) throw notFound("Lesson progress");

  const count = blockCount(lesson);
  if (input.lastBlockIndex !== undefined && input.lastBlockIndex >= count) {
    throw ruleViolation("BLOCK_INDEX_OUT_OF_RANGE", `lastBlockIndex must be < ${count}`);
  }

  const updated = await prisma.lessonProgress.update({
    where: { id: progress.id },
    data: {
      lastBlockIndex: Math.max(progress.lastBlockIndex, input.lastBlockIndex ?? 0),
      // Cap the delta to keep secondsSpent sane against replays/clients gone wild
      secondsSpent: { increment: Math.min(Math.max(input.secondsSpentDelta ?? 0, 0), 3600) },
    },
  });
  void now;
  return progressDto(updated);
}

/** Course completion check: all published lessons COMPLETED + final quiz passed (if any). */
async function checkCourseCompletion(
  tx: Tx,
  userId: string,
  courseId: string,
  at: Date,
  acc: Awards,
): Promise<{ courseCompleted: boolean; certificate: { code: string; issuedAt: string } | null }> {
  const course = await tx.course.findUnique({
    where: { id: courseId },
    include: {
      lessons: { where: { status: "PUBLISHED" }, select: { id: true } },
      translations: true,
    },
  });
  if (!course) return { courseCompleted: false, certificate: null };

  const lessonIds = course.lessons.map((l) => l.id);
  const completedCount = await tx.lessonProgress.count({
    where: { userId, lessonId: { in: lessonIds }, status: "COMPLETED" },
  });
  if (completedCount < lessonIds.length) return { courseCompleted: false, certificate: null };

  if (course.finalQuizId) {
    const passedAttempt = await tx.quizAttempt.findFirst({
      where: { userId, quizId: course.finalQuizId, status: "SUBMITTED", passed: true },
    });
    if (!passedAttempt) return { courseCompleted: false, certificate: null };
  }

  // Mark enrollment completed (idempotent)
  const enrollment = await tx.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (enrollment && !enrollment.completedAt) {
    await tx.enrollment.update({ where: { id: enrollment.id }, data: { completedAt: at } });
    const granted = await grantXp(tx, userId, course.xpReward, "COURSE_COMPLETE", "course", courseId, at, acc);
    if (granted > 0) {
      await awardBadgeByCode(tx, userId, "FIRST_COURSE", at, acc);
    }
  }

  // Issue certificate (idempotent via unique(userId, courseId))
  let cert = await tx.certificate.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!cert) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    const tr = course.translations.find((t) => t.locale === "vi") ?? course.translations[0];
    cert = await tx.certificate.create({
      data: {
        id: uuidv7(),
        code: certCode(),
        userId,
        courseId,
        issuedAt: at,
        snapshot: {
          displayName: user?.displayName ?? "Học sinh",
          courseTitle: tr?.title ?? course.slug,
          courseSlug: course.slug,
          issuedDate: at.toISOString().slice(0, 10),
        },
      },
    });
  }
  return {
    courseCompleted: true,
    certificate: { code: cert.code, issuedAt: cert.issuedAt.toISOString() },
  };
}

/**
 * POST /lessons/:id/complete - requires the lesson's check quiz passed (if present).
 * Awards lesson XP once (ledger guard), bumps streak/quests/badges, and - when this
 * closes out the course - completes the enrollment and issues the certificate.
 */
export async function completeLesson(userId: string, lessonId: string, now: Clock) {
  const at = now();
  const acc: Awards = emptyAwards();

  const result = await prisma.$transaction(async (tx) => {
    const lesson = await tx.lesson.findFirst({
      where: { id: lessonId, status: "PUBLISHED" },
    });
    if (!lesson) throw notFound("Lesson");

    const progress = await tx.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    if (!progress) throw notFound("Lesson progress");

    if (progress.status !== "COMPLETED") {
      // Precondition: check quiz passed (doc 03 §4.5)
      if (lesson.checkQuizId) {
        const passed = await tx.quizAttempt.findFirst({
          where: { userId, quizId: lesson.checkQuizId, status: "SUBMITTED", passed: true },
        });
        if (!passed) throw ruleViolation("CHECK_QUIZ_NOT_PASSED");
      }

      await tx.lessonProgress.update({
        where: { id: progress.id },
        data: { status: "COMPLETED", completedAt: at },
      });

      const granted = await grantXp(tx, userId, lesson.xpReward, "LESSON_COMPLETE", "lesson", lessonId, at, acc);
      if (granted > 0) {
        await tx.userStats.upsert({
          where: { userId },
          create: { userId, lessonsCompleted: 1 },
          update: { lessonsCompleted: { increment: 1 } },
        });
      }
      await touchStreak(tx, userId, at, acc);
      await bumpQuest(tx, userId, "q_complete_lesson", 1, at, acc);
      if (acc.xp > 0) await bumpQuest(tx, userId, "q_earn_xp_50", acc.xp, at, acc);
      await checkProgressBadges(tx, userId, at, acc);
    }

    const completion = await checkCourseCompletion(tx, userId, lesson.courseId, at, acc);
    const fresh = await tx.lessonProgress.findUniqueOrThrow({ where: { id: progress.id } });
    return { progress: fresh, completion };
  });

  return {
    progress: progressDto(result.progress),
    courseCompleted: result.completion.courseCompleted,
    certificate: result.completion.certificate,
    awards: acc,
  };
}
