import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { blockSchema } from "@/server/schemas/content";
import {
  emptyAwards,
  grantCoins,
  awardBadgeByCode,
  ensureDailyQuests,
} from "@/server/services/gamificationService";
import { vnDate, vnWeekStart, vnDateStartUtc, dateDiffDays } from "@/server/lib/time";

// Cron jobs - doc 01 §8. Every job is idempotent (safe to run twice) and writes a `cron_run` row.
// They are invoked by POST /api/internal/cron/{name} with the X-Cron-Secret header.

export const CRON_NAMES = [
  "daily-rollover",
  "weekly-leaderboard",
  "analytics-rollup",
  "integrity-check",
] as const;
export type CronName = (typeof CRON_NAMES)[number];

export function isCronName(v: string): v is CronName {
  return (CRON_NAMES as readonly string[]).includes(v);
}

export interface CronResult {
  name: CronName;
  ok: boolean;
  note: string;
  details: Record<string, unknown>;
}

// ── daily-rollover (00:05 VN) ────────────────────────────────────────────────

/**
 * Break streaks for users who did nothing yesterday, consuming a streak freeze when they hold one.
 * Idempotent: a user whose streakLastDate is already stale-and-broken (0) is skipped, and consuming
 * a freeze writes streakLastDate = yesterday so a second run sees the day as covered.
 */
async function dailyRollover(now: Date): Promise<CronResult> {
  const today = vnDate(now);
  const yesterday = vnDate(new Date(now.getTime() - 24 * 3600 * 1000));

  let broken = 0;
  let frozen = 0;

  // Only users with a live streak that did not touch it yesterday or today can be affected.
  const candidates = await prisma.userStats.findMany({
    where: {
      streakCurrent: { gt: 0 },
      OR: [{ streakLastDate: null }, { streakLastDate: { notIn: [today, yesterday] } }],
    },
    select: { userId: true, streakCurrent: true, streakLastDate: true, streakFreezes: true },
  });

  for (const s of candidates) {
    // A freeze covers exactly one missed day, so it only helps a user who missed exactly one.
    const missed = s.streakLastDate ? dateDiffDays(today, s.streakLastDate) - 1 : Infinity;
    if (missed === 1 && s.streakFreezes > 0) {
      const applied = await prisma.$transaction(async (tx) => {
        // The ledger's unique(userId, reason, refType, refId) makes the day's consumption
        // single-shot: a rerun inserts nothing and the decrement is skipped with it.
        const ins = await tx.coinLedger.createMany({
          data: [
            {
              id: uuidv7(),
              userId: s.userId,
              delta: 0, // a freeze spends an owned item, not coins - logged for audit only
              reason: "STREAK_FREEZE_USE",
              refType: "streak_freeze",
              refId: yesterday,
              createdAt: now,
            },
          ],
          skipDuplicates: true,
        });
        if (ins.count === 0) return false;
        await tx.userStats.update({
          where: { userId: s.userId },
          data: { streakFreezes: { decrement: 1 }, streakLastDate: yesterday },
        });
        return true;
      });
      if (applied) frozen++;
    } else {
      await prisma.userStats.update({
        where: { userId: s.userId },
        data: { streakCurrent: 0 },
      });
      broken++;
    }
  }

  // Today's quests for users active in the last 7 days (the rest get them lazily on first request).
  const activeSince = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const activeUsers = await prisma.user.findMany({
    where: { deletedAt: null, bannedAt: null, lastActiveAt: { gte: activeSince } },
    select: { id: true },
    take: 20000,
  });
  for (const u of activeUsers) {
    await prisma.$transaction((tx) => ensureDailyQuests(tx, u.id, now));
  }

  // Housekeeping: expired idempotency keys and rate-limit windows.
  const idem = await prisma.idempotencyKey.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 24 * 3600 * 1000) } },
  });
  const rl = await prisma.rateLimit.deleteMany({
    where: { windowStart: { lt: new Date(now.getTime() - 2 * 3600 * 1000) } },
  });

  return {
    name: "daily-rollover",
    ok: true,
    note: `broken=${broken} frozen=${frozen} quests=${activeUsers.length}`,
    details: {
      streaksBroken: broken,
      streaksFrozen: frozen,
      questsEnsured: activeUsers.length,
      idempotencyKeysPruned: idem.count,
      rateLimitRowsPruned: rl.count,
    },
  };
}

// ── weekly-leaderboard (Mon 00:10 VN) ────────────────────────────────────────

const TOP_N = 10;
/** Coin reward by finishing rank (doc 01 §8: "grant top-10 badges/coins"). */
function leaderboardCoins(rank: number): number {
  if (rank === 1) return 100;
  if (rank <= 3) return 60;
  return 30;
}

async function weeklyLeaderboard(now: Date): Promise<CronResult> {
  // Close the week that just ended.
  const thisWeek = vnWeekStart(now);
  const lastWeek = vnDate(new Date(vnDateStartUtc(thisWeek).getTime() - 24 * 3600 * 1000));
  const weekStart = vnWeekStart(vnDateStartUtc(lastWeek));
  const from = vnDateStartUtc(weekStart);
  const to = vnDateStartUtc(thisWeek);

  const grouped = await prisma.xpLedger.groupBy({
    by: ["userId"],
    where: { delta: { gt: 0 }, createdAt: { gte: from, lt: to } },
    _sum: { delta: true },
    orderBy: { _sum: { delta: "desc" } },
    take: 500,
  });

  const userIds = grouped.map((g) => g.userId);
  const alive = new Set(
    (
      await prisma.user.findMany({
        where: { id: { in: userIds }, deletedAt: null },
        select: { id: true },
      })
    ).map((u) => u.id),
  );

  let rank = 0;
  let written = 0;
  let rewarded = 0;
  for (const g of grouped) {
    if (!alive.has(g.userId)) continue;
    rank++;
    const xpEarned = g._sum.delta ?? 0;
    // unique(weekStart, userId) makes the write idempotent across reruns.
    await prisma.leaderboardResult.upsert({
      where: { weekStart_userId: { weekStart, userId: g.userId } },
      create: { id: uuidv7(), weekStart, userId: g.userId, rank, xpEarned },
      update: { rank, xpEarned },
    });
    written++;

    if (rank <= TOP_N) {
      // Check before granting rather than leaning on the ledger's unique key: a duplicate insert
      // inside a transaction aborts the whole block in Postgres, taking the badge write with it.
      const already = await prisma.coinLedger.findFirst({
        where: {
          userId: g.userId,
          reason: "LEADERBOARD_REWARD",
          refType: "leaderboard",
          refId: weekStart,
        },
        select: { id: true },
      });
      await prisma.$transaction(async (tx) => {
        const acc = emptyAwards();
        if (!already) {
          await grantCoins(
            tx,
            g.userId,
            leaderboardCoins(rank),
            "LEADERBOARD_REWARD",
            "leaderboard",
            weekStart,
            now,
            acc,
          );
          rewarded++;
        }
        await awardBadgeByCode(tx, g.userId, "LEADERBOARD_TOP10", now, acc);
      });
    }
  }

  return {
    name: "weekly-leaderboard",
    ok: true,
    note: `weekStart=${weekStart} rows=${written} rewarded=${rewarded}`,
    details: { weekStart, rowsWritten: written, usersRewarded: rewarded },
  };
}

// ── analytics-rollup (01:00 VN) ──────────────────────────────────────────────

async function upsertStat(statDate: string, metric: string, dims: object, value: number) {
  await prisma.dailyStat.upsert({
    where: { statDate_metric_dims: { statDate, metric, dims: JSON.stringify(dims) } },
    create: { statDate, metric, dims: JSON.stringify(dims), value },
    update: { value },
  });
}

/** Fill daily_stat for the previous VN day. Recomputes from source, so reruns are safe. */
async function analyticsRollup(now: Date): Promise<CronResult> {
  const day = vnDate(new Date(now.getTime() - 24 * 3600 * 1000));
  const from = vnDateStartUtc(day);
  const to = new Date(from.getTime() + 24 * 3600 * 1000);
  const written: string[] = [];

  const dau = await prisma.event.findMany({
    where: { ts: { gte: from, lt: to }, userId: { not: null } },
    distinct: ["userId"],
    select: { userId: true },
  });
  await upsertStat(day, "dau", {}, dau.length);
  written.push("dau");

  const signups = await prisma.user.count({
    where: { createdAt: { gte: from, lt: to } },
  });
  await upsertStat(day, "signups", {}, signups);
  written.push("signups");

  const lessonsCompleted = await prisma.lessonProgress.count({
    where: { completedAt: { gte: from, lt: to } },
  });
  await upsertStat(day, "lessons_completed", {}, lessonsCompleted);
  written.push("lessons_completed");

  // Per-lesson completion rate for lessons touched that day.
  const started = await prisma.lessonProgress.groupBy({
    by: ["lessonId"],
    where: { startedAt: { gte: from, lt: to } },
    _count: { _all: true },
  });
  for (const s of started) {
    const done = await prisma.lessonProgress.count({
      where: { lessonId: s.lessonId, completedAt: { gte: from, lt: to } },
    });
    const total = s._count._all;
    await upsertStat(
      day,
      "lesson_completion_rate",
      { lessonId: s.lessonId },
      total > 0 ? Math.round((done / total) * 10000) / 10000 : 0,
    );
  }
  written.push("lesson_completion_rate");

  const simStarted = await prisma.simSession.groupBy({
    by: ["simId"],
    where: { startedAt: { gte: from, lt: to } },
    _count: { _all: true },
  });
  for (const s of simStarted) {
    await upsertStat(day, "sim_started", { simId: s.simId }, s._count._all);
    const completed = await prisma.simSession.count({
      where: { simId: s.simId, status: "COMPLETED", endedAt: { gte: from, lt: to } },
    });
    await upsertStat(day, "sim_completed", { simId: s.simId }, completed);
  }
  written.push("sim_started", "sim_completed");

  // D1 retention for the cohort that signed up the day before `day`.
  const cohortDay = vnDate(new Date(from.getTime() - 24 * 3600 * 1000));
  const cohortFrom = vnDateStartUtc(cohortDay);
  const cohort = await prisma.user.findMany({
    where: { createdAt: { gte: cohortFrom, lt: from } },
    select: { id: true },
  });
  if (cohort.length > 0) {
    const ids = cohort.map((c) => c.id);
    const returned = await prisma.event.findMany({
      where: { userId: { in: ids }, ts: { gte: from, lt: to } },
      distinct: ["userId"],
      select: { userId: true },
    });
    await upsertStat(
      cohortDay,
      "d1_retention",
      { cohortDate: cohortDay },
      Math.round((returned.length / cohort.length) * 10000) / 10000,
    );
    written.push("d1_retention");
  }

  return {
    name: "analytics-rollup",
    ok: true,
    note: `day=${day} metrics=${written.length}`,
    details: { day, metrics: written, dau: dau.length, signups, lessonsCompleted },
  };
}

// ── integrity-check (02:00 VN) - doc 08 §4.2 ─────────────────────────────────

async function integrityCheck(now: Date): Promise<CronResult> {
  const violations: Array<{ check: string; detail: string }> = [];

  // 1 & 2. Ledger sums must equal the denormalized totals (sample 500 + everyone touched today).
  const todayStart = vnDateStartUtc(vnDate(now));
  const touched = await prisma.xpLedger.findMany({
    where: { createdAt: { gte: todayStart } },
    distinct: ["userId"],
    select: { userId: true },
    take: 2000,
  });
  const sampled = await prisma.userStats.findMany({ select: { userId: true }, take: 500 });
  const ids = Array.from(new Set([...touched.map((t) => t.userId), ...sampled.map((s) => s.userId)]));

  const xpSums = await prisma.xpLedger.groupBy({
    by: ["userId"],
    where: { userId: { in: ids } },
    _sum: { delta: true },
  });
  const coinSums = await prisma.coinLedger.groupBy({
    by: ["userId"],
    where: { userId: { in: ids } },
    _sum: { delta: true },
  });
  const stats = await prisma.userStats.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, xpTotal: true, coins: true },
  });
  const xpByUser = new Map(xpSums.map((r) => [r.userId, r._sum.delta ?? 0]));
  const coinByUser = new Map(coinSums.map((r) => [r.userId, r._sum.delta ?? 0]));
  for (const s of stats) {
    const xp = xpByUser.get(s.userId) ?? 0;
    if (xp !== s.xpTotal) {
      violations.push({ check: "xp_ledger_sum", detail: `${s.userId}: ledger=${xp} stats=${s.xpTotal}` });
    }
    const coins = coinByUser.get(s.userId) ?? 0;
    if (coins !== s.coins) {
      violations.push({ check: "coin_ledger_sum", detail: `${s.userId}: ledger=${coins} stats=${s.coins}` });
    }
    if (s.coins < 0) violations.push({ check: "coins_negative", detail: `${s.userId}: ${s.coins}` });
  }

  // 3. Submitted attempts must have a sane score.
  const badAttempts = await prisma.quizAttempt.findMany({
    where: { status: "SUBMITTED", OR: [{ scorePoints: null }, { scorePct: null }] },
    select: { id: true },
    take: 50,
  });
  for (const a of badAttempts) {
    violations.push({ check: "attempt_score_null", detail: a.id });
  }
  const overScored = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM quiz_attempt
    WHERE status = 'SUBMITTED' AND "scorePoints" > "maxPoints" LIMIT 50`;
  for (const a of overScored) {
    violations.push({ check: "attempt_score_over_max", detail: a.id });
  }

  // 4. Auto-abandon sim sessions stuck ACTIVE for more than 30 days.
  const staleCutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const abandoned = await prisma.simSession.updateMany({
    where: { status: "ACTIVE", startedAt: { lt: staleCutoff } },
    data: { status: "ABANDONED", endedAt: now },
  });

  // 5. Published lesson blocks must still satisfy the current content schema.
  const published = await prisma.lessonTranslation.findMany({
    where: { lesson: { status: "PUBLISHED" } },
    select: { lessonId: true, locale: true, blocks: true },
    take: 1000,
  });
  for (const t of published) {
    const blocks = Array.isArray(t.blocks) ? t.blocks : null;
    if (!blocks) {
      violations.push({ check: "lesson_blocks_shape", detail: `${t.lessonId}/${t.locale}` });
      continue;
    }
    for (const [i, b] of blocks.entries()) {
      if (!blockSchema.safeParse(b).success) {
        violations.push({ check: "lesson_block_invalid", detail: `${t.lessonId}/${t.locale}#${i}` });
        break;
      }
    }
  }

  // 6. Orphans that FKs cannot express.
  const orphanAnswers = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM quiz_answer a
    LEFT JOIN quiz_attempt t ON t.id = a."attemptId" WHERE t.id IS NULL`;
  const orphanCount = Number(orphanAnswers[0]?.n ?? 0n);
  if (orphanCount > 0) {
    violations.push({ check: "orphan_answers", detail: String(orphanCount) });
  }

  await upsertStat(vnDate(now), "integrity_violations", {}, violations.length);

  return {
    name: "integrity-check",
    ok: violations.length === 0,
    note: `violations=${violations.length} autoAbandoned=${abandoned.count}`,
    details: { violations: violations.slice(0, 50), autoAbandoned: abandoned.count },
  };
}

// ── runner ───────────────────────────────────────────────────────────────────

const JOBS: Record<CronName, (now: Date) => Promise<CronResult>> = {
  "daily-rollover": dailyRollover,
  "weekly-leaderboard": weeklyLeaderboard,
  "analytics-rollup": analyticsRollup,
  "integrity-check": integrityCheck,
};

export async function runCron(name: CronName, now: Date): Promise<CronResult> {
  let result: CronResult;
  try {
    result = await JOBS[name](now);
  } catch (e) {
    result = {
      name,
      ok: false,
      note: (e instanceof Error ? e.message : String(e)).slice(0, 400),
      details: {},
    };
  }
  await prisma.cronRun
    .create({ data: { id: uuidv7(), name, ranAt: now, ok: result.ok, note: result.note } })
    .catch(() => undefined); // a failed audit row must not mask the job's own result
  return result;
}
