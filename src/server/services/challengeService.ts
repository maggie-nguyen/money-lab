import type { Locale } from "@prisma/client";
import { prisma } from "@/server/db";
import type { Tx } from "@/server/db";
import { AppError } from "@/server/lib/errors";
import { uuidv7 } from "@/server/lib/ids";
import { vnDate } from "@/server/lib/time";
import { awardBadgeByCode, emptyAwards, grantCoins, grantXp, type Awards } from "@/server/services/gamificationService";

export interface ChallengeDefView {
  id: string;
  code: string;
  slug: string;
  durationDays: number;
  iconKey: string;
  title: string;
  description: string;
  savingsHint: string;
  badgeCode: string | null;
}

export interface UserChallengeView {
  id: string;
  challengeId: string;
  slug: string;
  title: string;
  description: string;
  durationDays: number;
  iconKey: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  startedAt: string;
  completedAt: string | null;
  tickDates: string[];
  progressDays: number;
  targetDays: number;
  todayTicked: boolean;
  canTickToday: boolean;
}

function pickTranslation<T extends { locale: Locale }>(rows: T[], locale: Locale): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "vi") ?? rows[0];
}

function parseTickDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d));
}

export async function listChallenges(locale: Locale): Promise<ChallengeDefView[]> {
  const rows = await prisma.savingsChallenge.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { order: "asc" },
    include: { translations: true },
  });
  return rows.map((c) => {
    const tr = pickTranslation(c.translations, locale);
    return {
      id: c.id,
      code: c.code,
      slug: c.slug,
      durationDays: c.durationDays,
      iconKey: c.iconKey,
      title: tr?.title ?? c.slug,
      description: tr?.description ?? "",
      savingsHint: tr?.savingsHint ?? "",
      badgeCode: c.badgeCode,
    };
  });
}

export async function listUserChallenges(userId: string, locale: Locale): Promise<UserChallengeView[]> {
  const participations = await prisma.userChallenge.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    orderBy: { startedAt: "desc" },
    include: { challenge: { include: { translations: true } } },
  });
  const today = vnDate(new Date());
  return participations.map((p) => serializeParticipation(p, locale, today));
}

function serializeParticipation(
  p: {
    id: string;
    challengeId: string;
    status: "ACTIVE" | "COMPLETED" | "ABANDONED";
    startedAt: Date;
    completedAt: Date | null;
    tickDates: unknown;
    challenge: {
      slug: string;
      durationDays: number;
      iconKey: string;
      translations: Array<{ locale: Locale; title: string; description: string }>;
    };
  },
  locale: Locale,
  today: string,
): UserChallengeView {
  const tr = pickTranslation(p.challenge.translations, locale);
  const tickDates = parseTickDates(p.tickDates);
  return {
    id: p.id,
    challengeId: p.challengeId,
    slug: p.challenge.slug,
    title: tr?.title ?? p.challenge.slug,
    description: tr?.description ?? "",
    durationDays: p.challenge.durationDays,
    iconKey: p.challenge.iconKey,
    status: p.status,
    startedAt: p.startedAt.toISOString(),
    completedAt: p.completedAt?.toISOString() ?? null,
    tickDates,
    progressDays: tickDates.length,
    targetDays: p.challenge.durationDays,
    todayTicked: tickDates.includes(today),
    canTickToday: p.status === "ACTIVE" && !tickDates.includes(today),
  };
}

export async function startChallenge(userId: string, challengeSlug: string, now: Date): Promise<UserChallengeView> {
  const challenge = await prisma.savingsChallenge.findFirst({
    where: { slug: challengeSlug, status: "PUBLISHED" },
    include: { translations: true },
  });
  if (!challenge) throw new AppError("NOT_FOUND", "Challenge not found");

  const active = await prisma.userChallenge.findFirst({
    where: { userId, challengeId: challenge.id, status: "ACTIVE" },
  });
  if (active) {
    return serializeParticipation(
      { ...active, challenge },
      "vi",
      vnDate(now),
    );
  }

  const created = await prisma.userChallenge.create({
    data: {
      id: uuidv7(),
      userId,
      challengeId: challenge.id,
      status: "ACTIVE",
      tickDates: [],
    },
    include: { challenge: { include: { translations: true } } },
  });
  return serializeParticipation(created, "vi", vnDate(now));
}

export async function tickChallenge(
  tx: Tx,
  userId: string,
  participationId: string,
  now: Date,
  locale: Locale,
): Promise<{ participation: UserChallengeView; awards: Awards }> {
  const acc = emptyAwards();
  const today = vnDate(now);
  const p = await tx.userChallenge.findFirst({
    where: { id: participationId, userId, status: "ACTIVE" },
    include: { challenge: { include: { translations: true } } },
  });
  if (!p) throw new AppError("INVALID_STATE", "Challenge is not active");

  const tickDates = parseTickDates(p.tickDates);
  if (tickDates.includes(today)) {
    throw new AppError("CONFLICT", "Already ticked today");
  }

  const nextTicks = [...tickDates, today];
  const completed = nextTicks.length >= p.challenge.durationDays;

  await tx.userChallenge.update({
    where: { id: p.id },
    data: {
      tickDates: nextTicks,
      ...(completed ? { status: "COMPLETED", completedAt: now } : {}),
    },
  });

  if (completed && p.challenge.badgeCode) {
    await awardBadgeByCode(tx, userId, p.challenge.badgeCode, now, acc, locale);
    await grantXp(tx, userId, 30, "CHALLENGE_COMPLETE", "user_challenge", p.id, now, acc);
    await grantCoins(tx, userId, 15, "CHALLENGE_COMPLETE", "user_challenge", p.id, now, acc);
  }

  const updated = {
    ...p,
    tickDates: nextTicks,
    status: completed ? ("COMPLETED" as const) : p.status,
    completedAt: completed ? now : p.completedAt,
  };
  return {
    participation: serializeParticipation(updated, locale, today),
    awards: acc,
  };
}
