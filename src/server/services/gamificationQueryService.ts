import type { Locale } from "@prisma/client";
import { prisma } from "@/server/db";
import { vnDate, type Clock } from "@/server/lib/time";
import { ensureDailyQuests, serializeQuest } from "@/server/services/gamificationService";

// Read-side gamification + shop - doc 03 §6.

/** GET /quests/today - lazily generates today's quests. */

export async function questsToday(userId: string, now: Clock, locale: Locale = "vi") {
  const at = now();
  await prisma.$transaction((tx) => ensureDailyQuests(tx, userId, at));
  const quests = await prisma.dailyQuest.findMany({
    where: { userId, questDate: vnDate(at) },
    orderBy: { code: "asc" },
  });
  return { questDate: vnDate(at), quests: quests.map((q) => serializeQuest(q, locale)) };
}

/** GET /badges - earned + available (never the criteria internals beyond description). */
export async function listBadges(userId: string, locale: Locale) {
  const [badges, mine] = await Promise.all([
    prisma.badge.findMany({ include: { translations: true }, orderBy: { code: "asc" } }),
    prisma.userBadge.findMany({ where: { userId } }),
  ]);
  const earnedAt = new Map(mine.map((ub) => [ub.badgeId, ub.awardedAt]));
  return badges.map((b) => {
    const tr =
      b.translations.find((t) => t.locale === locale) ??
      b.translations.find((t) => t.locale === "vi") ??
      b.translations[0];
    return {
      id: b.id,
      code: b.code,
      kind: b.kind,
      iconKey: b.iconKey,
      coinReward: b.coinReward,
      title: tr?.title ?? b.code,
      description: tr?.description ?? "",
      earnedAt: earnedAt.get(b.id)?.toISOString() ?? null,
    };
  });
}


