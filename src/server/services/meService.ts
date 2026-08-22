import { prisma } from "@/server/db";
import { notFound, ruleViolation } from "@/server/lib/errors";
import { toMeDto } from "@/server/services/authService";
import { vnDate, type Clock } from "@/server/lib/time";
import { ensureDailyQuests, serializeQuest } from "@/server/services/gamificationService";
import { allFlags } from "@/server/lib/flags";
import { isAvatarKey, isProvinceKey } from "@/server/lib/meta";
import type { UserStats } from "@prisma/client";

const PROFANITY = ["đụ", "địt", "cặc", "lồn", "fuck", "shit", "đĩ", "cave"];
// Avatar and province keys have a single source of truth in lib/meta (also served by /meta/*).

export function toStatsDto(s: UserStats) {
  return {
    xpTotal: s.xpTotal,
    level: s.level,
    xpForNextLevel: Math.pow(s.level, 2) * 100, // level = floor(sqrt(xp/100))+1 inverse
    coins: s.coins,
    streakCurrent: s.streakCurrent,
    streakLongest: s.streakLongest,
    streakLastDate: s.streakLastDate,
    streakFreezes: s.streakFreezes,
    lessonsCompleted: s.lessonsCompleted,
    quizzesPassed: s.quizzesPassed,
    simsCompleted: s.simsCompleted,
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw notFound("User");
  return toMeDto(user);
}

export async function patchMe(
  userId: string,
  input: {
    displayName?: string;
    avatarKey?: string;
    birthYear?: number | null;
    province?: string | null;
  },
) {
  if (input.displayName) {
    const lower = input.displayName.toLowerCase();
    if (PROFANITY.some((w) => lower.includes(w))) {
      throw ruleViolation("PROFANITY", "Tên hiển thị không hợp lệ");
    }
  }
  if (input.avatarKey && !isAvatarKey(input.avatarKey)) {
    throw ruleViolation("BAD_AVATAR", "Avatar không hợp lệ");
  }
  if (input.province && !isProvinceKey(input.province)) {
    throw ruleViolation("BAD_PROVINCE", "Tỉnh/thành không hợp lệ");
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.avatarKey !== undefined ? { avatarKey: input.avatarKey } : {}),
      ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {}),
      ...(input.province !== undefined ? { province: input.province } : {}),
    },
  });
  return toMeDto(user);
}

export async function deleteMe(userId: string, now: Clock) {
  const at = now();
  const scheduledPurgeAt = new Date(at.getTime() + 30 * 24 * 3600 * 1000);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: at,
        email: null,
        passwordHash: null,
        displayName: "Người dùng đã xóa",
        avatarKey: null,
        birthYear: null,
        province: null,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    }),
    prisma.oauthAccount.deleteMany({ where: { userId } }),
  ]);
  return { scheduledPurgeAt: scheduledPurgeAt.toISOString() };
}

export async function exportMe(userId: string) {
  const [user, stats, enrollments, lessonProgress, quizAttempts, xp, coins, badges, sims, threads] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.userStats.findUnique({ where: { userId } }),
      prisma.enrollment.findMany({ where: { userId } }),
      prisma.lessonProgress.findMany({ where: { userId } }),
      prisma.quizAttempt.findMany({ where: { userId } }),
      prisma.xpLedger.findMany({ where: { userId } }),
      prisma.coinLedger.findMany({ where: { userId } }),
      prisma.userBadge.findMany({ where: { userId }, include: { badge: true } }),
      prisma.simSession.findMany({ where: { userId } }),
      prisma.tutorThread.findMany({ where: { userId }, include: { messages: true } }),
    ]);
  if (!user) throw notFound("User");
  return {
    exportedAt: new Date().toISOString(),
    user: toMeDto(user),
    stats: stats ? toStatsDto(stats) : null,
    enrollments,
    lessonProgress,
    quizAttempts,
    xpLedger: xp,
    coinLedger: coins,
    badges: badges.map((b) => ({ code: b.badge.code, awardedAt: b.awardedAt })),
    simSessions: sims.map((s) => ({
      id: s.id,
      simId: s.simId,
      status: s.status,
      summary: s.summary,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    })),
    tutorThreads: threads.map((t) => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt,
      messages: t.messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    })),
  };
}

export async function getStats(userId: string) {
  const stats = await prisma.userStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return toStatsDto(stats);
}

export async function getBootstrap(userId: string, now: Clock) {
  const at = now();
  const [user, stats] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.userStats.upsert({ where: { userId }, create: { userId }, update: {} }),
  ]);
  if (!user || user.deletedAt) throw notFound("User");

  // The catalogue shows today's quests in its sidebar, so they have to exist by
  // the time bootstrap answers rather than only after a visit to /quests.
  await ensureDailyQuests(prisma, userId, at);

  const [dailyQuests, activeSims, lastProgress, unread] = await Promise.all([
    // Today only, in VN time. Yesterday's quests are history and would otherwise
    // sit at the top of the list, since ids are time ordered.
    prisma.dailyQuest.findMany({
      where: { userId, questDate: vnDate(at) },
      orderBy: { code: "asc" },
      take: 10,
    }),
    prisma.simSession.findMany({
      where: { userId, status: "ACTIVE" },
      include: { sim: true },
    }),
    prisma.lessonProgress.findFirst({
      where: { userId, completedAt: null },
      orderBy: { startedAt: "desc" },
      include: { lesson: { include: { course: true } } },
    }),
    prisma.userBadge.findMany({
      where: {
        userId,
        awardedAt: { gt: stats.badgesSeenAt ?? new Date(0) },
      },
      include: { badge: { include: { translations: { where: { locale: user.localePref } } } } },
    }),
  ]);

  await prisma.userStats.update({ where: { userId }, data: { badgesSeenAt: at } });
  await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: at } });

  return {
    user: toMeDto(user),
    stats: toStatsDto(stats),
    featureFlags: await allFlags(),
    // Same DailyQuest shape as /me/quests/today, doc 03 §6.1. It has to be:
    // the client types both as DailyQuest and reads title and targetInt off it.
    dailyQuests: dailyQuests.map((q) => serializeQuest(q, user.localePref)),
    activeSimSessions: activeSims.map((s) => ({
      sessionId: s.id,
      simSlug: s.sim.slug,
      simType: s.sim.type,
      turnNumber: s.turnNumber,
    })),
    continueLearning: lastProgress
      ? {
          lessonId: lastProgress.lessonId,
          lessonSlug: lastProgress.lesson.slug,
          courseSlug: lastProgress.lesson.course.slug,
          lastBlockIndex: lastProgress.lastBlockIndex,
        }
      : null,
    unreadBadges: unread.map((b) => ({
      code: b.badge.code,
      title: b.badge.translations[0]?.title ?? b.badge.code,
    })),
  };
}

export async function getLedger(
  userId: string,
  type: "xp" | "coin",
  limit: number,
  cursor?: string,
) {
  const where = { userId, ...(cursor ? { id: { lt: cursor } } : {}) };
  const rows =
    type === "xp"
      ? await prisma.xpLedger.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 })
      : await prisma.coinLedger.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    data: page.map((r) => ({
      delta: r.delta,
      reason: r.reason,
      refType: r.refType,
      refId: r.refId,
      createdAt: r.createdAt.toISOString(),
    })),
    meta: { nextCursor: hasMore ? page[page.length - 1]!.id : null },
  };
}
