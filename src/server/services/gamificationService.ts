import type { LedgerReason, Locale } from "@prisma/client";
import type { Tx } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { vnDate, vnYesterday, vnDateStartUtc } from "@/server/lib/time";

// Gamification core - doc 03 §0 GamifiedResult, §6; doc 01 §7.
// All mutations run inside the caller's transaction (Tx) so awards are atomic
// with the action that earned them. Ledger unique(userId, reason, refType, refId)
// is the anti-double-award guard: a duplicate insert is skipped → 0 granted.
//
// Anti-double-award writes MUST use createMany({ skipDuplicates: true }) - it compiles to
// INSERT ... ON CONFLICT DO NOTHING. Catching P2002 instead would leave the surrounding
// Postgres transaction in an aborted state (25P02) and fail every later statement in it.

export interface Awards {
  xp: number;
  coins: number;
  badges: Array<{ code: string; title: string }>;
  questProgress: Array<{ code: string; progressInt: number; targetInt: number; completed: boolean }>;
  streak: { current: number; extendedToday: boolean };
  levelUp: { from: number; to: number } | null;
}

export const emptyAwards = (): Awards => ({
  xp: 0,
  coins: 0,
  badges: [],
  questProgress: [],
  streak: { current: 0, extendedToday: false },
  levelUp: null,
});

export const levelForXp = (xp: number): number => Math.floor(Math.sqrt(xp / 100)) + 1;

const SIM_TURN_DAILY_XP_CAP = 50; // doc 04 §1.5

/** Award XP through the ledger. Returns granted amount (0 if guard hit / capped away). */
export async function grantXp(
  tx: Tx,
  userId: string,
  delta: number,
  reason: LedgerReason,
  refType: string | null,
  refId: string | null,
  now: Date,
  acc: Awards,
): Promise<number> {
  if (delta <= 0) return 0;

  let granted = delta;
  if (reason === "SIM_TURN") {
    // Daily cap across all sims - doc 04 §1.5
    const todayStart = vnDateStartUtc(vnDate(now));
    const agg = await tx.xpLedger.aggregate({
      where: { userId, reason: "SIM_TURN", createdAt: { gte: todayStart } },
      _sum: { delta: true },
    });
    const usedToday = agg._sum.delta ?? 0;
    granted = Math.max(0, Math.min(delta, SIM_TURN_DAILY_XP_CAP - usedToday));
    if (granted === 0) return 0;
  }

  const inserted = await tx.xpLedger.createMany({
    data: [{ id: uuidv7(), userId, delta: granted, reason, refType, refId, createdAt: now }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return 0; // already awarded for this (reason, ref)

  const stats = await tx.userStats.upsert({
    where: { userId },
    create: { userId, xpTotal: granted, level: levelForXp(granted) },
    update: { xpTotal: { increment: granted } },
  });
  // upsert returns the post-update row
  const newLevel = levelForXp(stats.xpTotal);
  if (newLevel !== stats.level) {
    await tx.userStats.update({ where: { userId }, data: { level: newLevel } });
    acc.levelUp = { from: acc.levelUp?.from ?? stats.level, to: newLevel };
  }
  acc.xp += granted;
  return granted;
}

/** Award (or deduct) coins through the ledger. Negative delta = spend (caller checks balance). */
export async function grantCoins(
  tx: Tx,
  userId: string,
  delta: number,
  reason: LedgerReason,
  refType: string | null,
  refId: string | null,
  now: Date,
  acc: Awards,
): Promise<number> {
  if (delta === 0) return 0;
  const inserted = await tx.coinLedger.createMany({
    data: [{ id: uuidv7(), userId, delta, reason, refType, refId, createdAt: now }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return 0;
  await tx.userStats.upsert({
    where: { userId },
    create: { userId, coins: Math.max(0, delta) },
    update: { coins: { increment: delta } },
  });
  if (delta > 0) acc.coins += delta;
  return delta;
}

/** Extend the VN-timezone streak if today qualifies. Called on any learning activity. */
export async function touchStreak(tx: Tx, userId: string, now: Date, acc: Awards): Promise<void> {
  const today = vnDate(now);
  const yesterday = vnYesterday(now);
  const stats = await tx.userStats.upsert({ where: { userId }, create: { userId }, update: {} });

  if (stats.streakLastDate === today) {
    acc.streak = { current: stats.streakCurrent, extendedToday: false };
    return;
  }
  const next = stats.streakLastDate === yesterday ? stats.streakCurrent + 1 : 1;
  await tx.userStats.update({
    where: { userId },
    data: {
      streakCurrent: next,
      streakLongest: Math.max(stats.streakLongest, next),
      streakLastDate: today,
    },
  });
  acc.streak = { current: next, extendedToday: true };

  // Streak badges
  if (next >= 7) await awardBadgeByCode(tx, userId, "STREAK_7", now, acc);
  if (next >= 30) await awardBadgeByCode(tx, userId, "STREAK_30", now, acc);
}

// ── Daily quests - doc 03 §6.1 ───────────────────────────────────────────────

const QUEST_DEFS: Array<{ code: string; targetInt: number; xpReward: number; coinReward: number }> = [
  { code: "q_complete_lesson", targetInt: 1, xpReward: 15, coinReward: 5 },
  { code: "q_earn_xp_50", targetInt: 50, xpReward: 10, coinReward: 5 },
  { code: "q_sim_turns_3", targetInt: 3, xpReward: 15, coinReward: 5 },
];

export const QUEST_TITLES_VI: Record<string, string> = {
  q_complete_lesson: "Hoàn thành 1 bài học",
  q_earn_xp_50: "Kiếm 50 XP",
  q_sim_turns_3: "Làm 3 lượt mô phỏng",
};

export async function ensureDailyQuests(tx: Tx, userId: string, now: Date): Promise<void> {
  const questDate = vnDate(now);
  await tx.dailyQuest.createMany({
    data: QUEST_DEFS.map((q) => ({
      id: uuidv7(),
      userId,
      questDate,
      code: q.code,
      targetInt: q.targetInt,
      xpReward: q.xpReward,
      coinReward: q.coinReward,
    })),
    skipDuplicates: true,
  });
}

/** Increment quest progress; grants rewards on completion. */
export async function bumpQuest(
  tx: Tx,
  userId: string,
  code: string,
  incr: number,
  now: Date,
  acc: Awards,
): Promise<void> {
  if (incr <= 0) return;
  await ensureDailyQuests(tx, userId, now);
  const questDate = vnDate(now);
  const quest = await tx.dailyQuest.findUnique({
    where: { userId_questDate_code: { userId, questDate, code } },
  });
  if (!quest || quest.completedAt) return;
  const progress = Math.min(quest.targetInt, quest.progressInt + incr);
  const completed = progress >= quest.targetInt;
  await tx.dailyQuest.update({
    where: { id: quest.id },
    data: { progressInt: progress, ...(completed ? { completedAt: now } : {}) },
  });
  acc.questProgress.push({ code, progressInt: progress, targetInt: quest.targetInt, completed });
  if (completed) {
    await grantXp(tx, userId, quest.xpReward, "DAILY_QUEST", "daily_quest", quest.id, now, acc);
    await grantCoins(tx, userId, quest.coinReward, "DAILY_QUEST", "daily_quest", quest.id, now, acc);
  }
}

// ── Badges ───────────────────────────────────────────────────────────────────

export async function awardBadgeByCode(
  tx: Tx,
  userId: string,
  code: string,
  now: Date,
  acc: Awards,
  locale: Locale = "vi",
): Promise<boolean> {
  const badge = await tx.badge.findUnique({
    where: { code },
    include: { translations: { where: { locale } } },
  });
  if (!badge) return false;
  const inserted = await tx.userBadge.createMany({
    data: [{ id: uuidv7(), userId, badgeId: badge.id, awardedAt: now }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return false; // already held
  acc.badges.push({ code, title: badge.translations[0]?.title ?? code });
  if (badge.coinReward > 0) {
    await grantCoins(tx, userId, badge.coinReward, "BADGE_AWARD", "badge", badge.id, now, acc);
  }
  return true;
}

/** Progress-count badges checked after lesson/course/quiz milestones. */
export async function checkProgressBadges(
  tx: Tx,
  userId: string,
  now: Date,
  acc: Awards,
): Promise<void> {
  const stats = await tx.userStats.findUnique({ where: { userId } });
  if (!stats) return;
  if (stats.lessonsCompleted >= 1) await awardBadgeByCode(tx, userId, "FIRST_LESSON", now, acc);
  if (stats.lessonsCompleted >= 10) await awardBadgeByCode(tx, userId, "TEN_LESSONS", now, acc);
}

export function serializeQuest(q: {
  id: string;
  code: string;
  questDate: string;
  targetInt: number;
  progressInt: number;
  completedAt: Date | null;
  xpReward: number;
  coinReward: number;
}) {
  return {
    id: q.id,
    code: q.code,
    title: QUEST_TITLES_VI[q.code] ?? q.code,
    questDate: q.questDate,
    targetInt: q.targetInt,
    progressInt: q.progressInt,
    completedAt: q.completedAt?.toISOString() ?? null,
    xpReward: q.xpReward,
    coinReward: q.coinReward,
  };
}
