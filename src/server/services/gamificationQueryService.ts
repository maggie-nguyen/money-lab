import type { Locale } from "@prisma/client";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { notFound, ruleViolation, conflict } from "@/server/lib/errors";
import { vnDate, vnWeekStart, type Clock } from "@/server/lib/time";
import {
  emptyAwards,
  ensureDailyQuests,
  serializeQuest,
  grantCoins,
  type Awards,
} from "@/server/services/gamificationService";

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

/** Display name shown on leaderboards. Everyone is already pseudonymous
 *  (displayName is self-chosen, no real-name requirement); the privacy rule
 *  that matters here is simply that emails never reach a board. */
function boardName(u: { displayName: string; avatarKey: string | null }) {
  return { displayName: u.displayName, avatarKey: u.avatarKey };
}

/** GET /leaderboards/weekly - live SUM over xp_ledger for [vnWeekStart, now). */
export async function weeklyLeaderboard(userId: string, now: Clock) {
  const at = now();
  const weekStart = vnWeekStart(at);
  // weekStart is a VN-local date string; convert to the UTC instant it began
  const weekStartUtc = new Date(`${weekStart}T00:00:00+07:00`);

  const grouped = await prisma.xpLedger.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: weekStartUtc }, delta: { gt: 0 } },
    _sum: { delta: true },
    orderBy: { _sum: { delta: "desc" } },
    take: 20,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) }, deletedAt: null },
    select: { id: true, displayName: true, avatarKey: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const entries = grouped
    .filter((g) => byId.has(g.userId))
    .map((g, i) => ({
      rank: i + 1,
      userId: g.userId === userId ? userId : null, // only reveal own id
      isMe: g.userId === userId,
      xpEarned: g._sum.delta ?? 0,
      ...boardName(byId.get(g.userId)!),
    }));

  // Caller's own row even if outside top 20
  let me = entries.find((e) => e.isMe) ?? null;
  if (!me) {
    const mine = await prisma.xpLedger.aggregate({
      where: { userId, createdAt: { gte: weekStartUtc }, delta: { gt: 0 } },
      _sum: { delta: true },
    });
    const myXp = mine._sum.delta ?? 0;
    const above = await prisma.xpLedger.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: weekStartUtc }, delta: { gt: 0 } },
      _sum: { delta: true },
      having: { delta: { _sum: { gt: myXp } } },
    });
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, avatarKey: true },
    });
    me = {
      rank: above.length + 1,
      userId,
      isMe: true,
      xpEarned: myXp,
      ...boardName(u ?? { displayName: "Learner", avatarKey: null }),
    };
  }
  return { weekStart, entries, me };
}

/** GET /leaderboards/history - frozen weekly results for the caller. */
export async function leaderboardHistory(userId: string) {
  const rows = await prisma.leaderboardResult.findMany({
    where: { userId },
    orderBy: { weekStart: "desc" },
    take: 12,
  });
  return rows.map((r) => ({ weekStart: r.weekStart, rank: r.rank, xpEarned: r.xpEarned }));
}

// ── Shop - doc 03 §6.5/6.6 ──────────────────────────────────────────────────

export async function listShopItems(userId: string, locale: Locale) {
  const [items, purchases, stats] = await Promise.all([
    prisma.shopItem.findMany({ where: { status: "PUBLISHED" }, include: { translations: true } }),
    prisma.userPurchase.findMany({ where: { userId } }),
    prisma.userStats.findUnique({ where: { userId } }),
  ]);
  const owned = new Set(purchases.map((p) => p.itemId));
  return {
    coins: stats?.coins ?? 0,
    items: items.map((it) => {
      const tr =
        it.translations.find((t) => t.locale === locale) ??
        it.translations.find((t) => t.locale === "vi") ??
        it.translations[0];
      return {
        id: it.id,
        code: it.code,
        kind: it.kind,
        priceCoins: it.priceCoins,
        title: tr?.title ?? it.code,
        owned: owned.has(it.id),
        // STREAK_FREEZE is consumable - repeat purchases allowed; show held count
        ...(it.code === "STREAK_FREEZE" ? { held: stats?.streakFreezes ?? 0 } : {}),
      };
    }),
  };
}

/**
 * POST /shop/items/:id/purchase - atomic balance check + spend + grant.
 * Non-consumables (avatar packs): 409 if already owned.
 * STREAK_FREEZE: consumable, increments stats.streakFreezes (max hold 3).
 */
export async function purchaseItem(userId: string, itemId: string, now: Clock) {
  const at = now();
  const acc: Awards = emptyAwards();

  return prisma.$transaction(async (tx) => {
    const item = await tx.shopItem.findFirst({
      where: { id: itemId, status: "PUBLISHED" },
    });
    if (!item) throw notFound("Shop item");

    const consumable = item.code === "STREAK_FREEZE";
    if (!consumable) {
      const existing = await tx.userPurchase.findFirst({ where: { userId, itemId } });
      if (existing) throw conflict("Item already owned");
    }

    // Lock the stats row so concurrent purchases serialize on the balance
    const rows = await tx.$queryRaw<Array<{ coins: number; streakFreezes: number }>>`
      SELECT coins, "streakFreezes" FROM user_stats WHERE "userId" = ${userId} FOR UPDATE`;
    const stats = rows[0];
    if (!stats || stats.coins < item.priceCoins) {
      throw ruleViolation("INSUFFICIENT_COINS");
    }
    if (consumable && stats.streakFreezes >= 3) {
      throw ruleViolation("FREEZE_HOLD_LIMIT", "You can hold at most 3 streak freezes");
    }

    const purchase = await tx.userPurchase.create({
      data: { id: uuidv7(), userId, itemId, createdAt: at },
    });
    await grantCoins(tx, userId, -item.priceCoins, "SHOP_PURCHASE", "purchase", purchase.id, at, acc);
    if (consumable) {
      await tx.userStats.update({
        where: { userId },
        data: { streakFreezes: { increment: 1 } },
      });
    }

    const fresh = await tx.userStats.findUnique({ where: { userId } });
    return {
      purchaseId: purchase.id,
      itemCode: item.code,
      coins: fresh?.coins ?? 0,
      ...(consumable ? { streakFreezes: fresh?.streakFreezes ?? 0 } : {}),
    };
  });
}
