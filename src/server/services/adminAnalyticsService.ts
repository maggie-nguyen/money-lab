import { z } from "zod";
import { prisma } from "@/server/db";
import { AppError } from "@/server/lib/errors";
import { vnDate } from "@/server/lib/time";

// Admin analytics - doc 03 §14.5. Reads mostly from daily_stat (written by the
// analytics-rollup cron) plus a few live queries where per-entity detail is needed.

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const rangeQuery = z.object({
  from: z.string().regex(dateRe).optional(),
  to: z.string().regex(dateRe).optional(),
});

function resolveRange(q: { from?: string; to?: string }, now: Date, defaultDays = 30) {
  const to = q.to ?? vnDate(now);
  const from =
    q.from ??
    (() => {
      const d = new Date(`${to}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - defaultDays + 1);
      return d.toISOString().slice(0, 10);
    })();
  if (from > to) {
    throw new AppError("VALIDATION_ERROR", "Invalid range", {
      details: [{ path: "from", message: "from must be <= to" }],
    });
  }
  return { from, to };
}

async function statSeries(metric: string, from: string, to: string, dims = "{}") {
  const rows = await prisma.dailyStat.findMany({
    where: { metric, dims, statDate: { gte: from, lte: to } },
    orderBy: { statDate: "asc" },
  });
  return rows.map((r) => ({ date: r.statDate, value: Number(r.value) }));
}

// ── Overview ─────────────────────────────────────────────────────────────────

export const overviewQuery = rangeQuery;

export async function analyticsOverview(q: z.infer<typeof rangeQuery>, now: Date) {
  const { from, to } = resolveRange(q, now);
  const [dau, signups, lessonsCompleted, d1, totals] = await Promise.all([
    statSeries("dau", from, to),
    statSeries("signups", from, to),
    statSeries("lessons_completed", from, to),
    statSeries("d1_retention", from, to),
    (async () => {
      const [users, activeEnrollments, certificates] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.enrollment.count(),
        prisma.certificate.count({ where: { status: "ACTIVE" } }),
      ]);
      return { users, activeEnrollments, certificates };
    })(),
  ]);
  // Activation = share of the range's signups that completed ≥1 lesson (live query - cheap at this scale).
  const fromUtc = new Date(`${from}T00:00:00Z`);
  const toUtc = new Date(`${to}T23:59:59Z`);
  const cohort = await prisma.user.findMany({
    where: { createdAt: { gte: fromUtc, lte: toUtc }, deletedAt: null },
    select: { id: true },
  });
  let activated = 0;
  if (cohort.length > 0) {
    const withLesson = await prisma.lessonProgress.groupBy({
      by: ["userId"],
      where: { userId: { in: cohort.map((u) => u.id) }, status: "COMPLETED" },
    });
    activated = withLesson.length;
  }
  return {
    range: { from, to },
    series: { dau, signups, lessonsCompleted, d1Retention: d1 },
    totals,
    activation: {
      cohortSize: cohort.length,
      activated,
      pct: cohort.length > 0 ? Math.round((activated / cohort.length) * 100) : null,
    },
  };
}

// ── Content health ───────────────────────────────────────────────────────────

export const contentHealthQuery = z.object({
  courseId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export async function contentHealth(q: z.infer<typeof contentHealthQuery>) {
  const lessons = await prisma.lesson.findMany({
    where: { status: "PUBLISHED", ...(q.courseId ? { courseId: q.courseId } : {}) },
    include: { translations: { where: { locale: "vi" } } },
    orderBy: [{ courseId: "asc" }, { order: "asc" }],
    take: q.limit,
  });
  const lessonIds = lessons.map((l) => l.id);
  const progress = await prisma.lessonProgress.findMany({
    where: { lessonId: { in: lessonIds } },
    select: { lessonId: true, status: true, secondsSpent: true, lastBlockIndex: true },
  });
  const byLesson = new Map<string, typeof progress>();
  for (const p of progress) {
    const arr = byLesson.get(p.lessonId) ?? [];
    arr.push(p);
    byLesson.set(p.lessonId, arr);
  }
  const lessonRows = lessons.map((l) => {
    const rows = byLesson.get(l.id) ?? [];
    const completed = rows.filter((r) => r.status === "COMPLETED");
    const seconds = completed.map((r) => r.secondsSpent).sort((a, b) => a - b);
    // Where do non-finishers stall? Histogram of lastBlockIndex among IN_PROGRESS rows.
    const dropOff: Record<string, number> = {};
    for (const r of rows) {
      if (r.status !== "COMPLETED") dropOff[String(r.lastBlockIndex)] = (dropOff[String(r.lastBlockIndex)] ?? 0) + 1;
    }
    return {
      lessonId: l.id,
      slug: l.slug,
      title: l.translations[0]?.title ?? l.slug,
      courseId: l.courseId,
      started: rows.length,
      completed: completed.length,
      completionRatePct: rows.length > 0 ? Math.round((completed.length / rows.length) * 100) : null,
      medianSecondsSpent: median(seconds),
      dropOffBlockHistogram: dropOff,
    };
  });

  // Per-question first-try accuracy: correctness on attemptNumber === 1 answers.
  const questions = await prisma.question.findMany({
    where: { quiz: { status: "PUBLISHED" } },
    select: { id: true, quizId: true, order: true, type: true },
    orderBy: [{ quizId: "asc" }, { order: "asc" }],
    take: 500,
  });
  const firstTry = await prisma.quizAnswer.groupBy({
    by: ["questionId", "isCorrect"],
    where: { questionId: { in: questions.map((question) => question.id) }, attempt: { attemptNumber: 1, status: "SUBMITTED" } },
    _count: { _all: true },
  });
  const tally = new Map<string, { correct: number; total: number }>();
  for (const row of firstTry) {
    const t = tally.get(row.questionId) ?? { correct: 0, total: 0 };
    t.total += row._count._all;
    if (row.isCorrect === true) t.correct += row._count._all;
    tally.set(row.questionId, t);
  }
  const questionRows = questions.map((question) => {
    const t = tally.get(question.id);
    return {
      questionId: question.id,
      quizId: question.quizId,
      order: question.order,
      type: question.type,
      firstTryAttempts: t?.total ?? 0,
      firstTryAccuracyPct: t && t.total > 0 ? Math.round((t.correct / t.total) * 100) : null,
    };
  });

  return { lessons: lessonRows, questions: questionRows };
}

// ── Sims ─────────────────────────────────────────────────────────────────────

export async function simAnalytics() {
  const sims = await prisma.simDefinition.findMany({
    where: { status: { in: ["PUBLISHED", "ARCHIVED"] } },
    include: { translations: { where: { locale: "vi" } } },
    orderBy: { order: "asc" },
  });
  const sessions = await prisma.simSession.findMany({
    where: { simId: { in: sims.map((s) => s.id) } },
    select: { simId: true, status: true, turnNumber: true, summary: true },
  });
  const bySim = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = bySim.get(s.simId) ?? [];
    arr.push(s);
    bySim.set(s.simId, arr);
  }
  return {
    sims: sims.map((sim) => {
      const rows = bySim.get(sim.id) ?? [];
      const completed = rows.filter((r) => r.status === "COMPLETED");
      const turns = completed.map((r) => r.turnNumber).sort((a, b) => a - b);
      const outcomes: Record<string, number> = {};
      for (const r of completed) {
        const outcome = (r.summary as { outcome?: string } | null)?.outcome ?? "unknown";
        outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      }
      return {
        simId: sim.id,
        slug: sim.slug,
        type: sim.type,
        title: sim.translations[0]?.title ?? sim.slug,
        started: rows.length,
        completed: completed.length,
        abandoned: rows.filter((r) => r.status === "ABANDONED").length,
        active: rows.filter((r) => r.status === "ACTIVE").length,
        medianTurns: median(turns),
        outcomeHistogram: outcomes,
      };
    }),
  };
}

// ── Funnel ───────────────────────────────────────────────────────────────────

export const funnelQuery = rangeQuery.extend({
  steps: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[a-z0-9_.]{2,60}$/)).min(2).max(8)),
});

/** Loose ordered funnel: a user counts for step N if they fired all steps 1..N in the range. */
export async function funnel(q: { steps: string[]; from?: string; to?: string }, now: Date) {
  const { from, to } = resolveRange(q, now);
  const fromUtc = new Date(`${from}T00:00:00Z`);
  const toUtc = new Date(`${to}T23:59:59Z`);
  const events = await prisma.event.groupBy({
    by: ["name", "userId"],
    where: { name: { in: q.steps }, ts: { gte: fromUtc, lte: toUtc }, userId: { not: null } },
  });
  const usersByStep = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.userId) continue;
    const set = usersByStep.get(e.name) ?? new Set<string>();
    set.add(e.userId);
    usersByStep.set(e.name, set);
  }
  let survivors: Set<string> | null = null;
  const steps = q.steps.map((name) => {
    const stepUsers = usersByStep.get(name) ?? new Set<string>();
    survivors =
      survivors === null ? stepUsers : new Set([...survivors].filter((u) => stepUsers.has(u)));
    return { name, users: survivors.size };
  });
  const first = steps[0]?.users ?? 0;
  return {
    range: { from, to },
    steps: steps.map((s) => ({
      ...s,
      pctOfFirst: first > 0 ? Math.round((s.users / first) * 100) : null,
    })),
  };
}
