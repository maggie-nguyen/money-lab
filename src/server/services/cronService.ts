import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { ensureDailyQuests } from "@/server/services/gamificationService";
import { vnDate, vnDateStartUtc, dateDiffDays } from "@/server/lib/time";

// Cron jobs - doc 01 §8. Every job is idempotent (safe to run twice) and writes a `cron_run` row.
// Vercel invokes them by GET with a Bearer token; manual schedulers may use
// POST with the X-Cron-Secret header.

export const CRON_NAMES = [
  "daily-rollover",
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
    details: { day, metrics: written, dau: dau.length, signups },
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

  await upsertStat(vnDate(now), "integrity_violations", {}, violations.length);

  return {
    name: "integrity-check",
    ok: violations.length === 0,
    note: `violations=${violations.length}`,
    details: { violations: violations.slice(0, 50) },
  };
}

// ── runner ───────────────────────────────────────────────────────────────────

const JOBS: Record<CronName, (now: Date) => Promise<CronResult>> = {
  "daily-rollover": dailyRollover,
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
