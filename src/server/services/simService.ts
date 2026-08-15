import { randomInt } from "node:crypto";
import type { Locale, Prisma, SimDefinition, SimDefinitionTranslation, SimSession } from "@prisma/client";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { notFound, conflict, ruleViolation, versionConflict, invalidState } from "@/server/lib/errors";
import { turnRng } from "@/server/lib/rng";
import type { Clock } from "@/server/lib/time";
import { getEngine } from "@/server/engines";
import type { EngineJson, TextBundle } from "@/server/engines/types";
import {
  emptyAwards,
  grantXp,
  touchStreak,
  bumpQuest,
  awardBadgeByCode,
  type Awards,
} from "@/server/services/gamificationService";

// Sim sessions - doc 03 §7, doc 04 §1. Server-authoritative; one transaction
// per action (SELECT FOR UPDATE → version check → apply → persist + log + XP).

const SIM_TURN_XP = 5;
const SIM_TURN_MAX_TURNS = 10; // per session (doc 04 §1.5)

type SimWithTr = SimDefinition & { translations: SimDefinitionTranslation[] };

function pickTr(sim: SimWithTr, locale: Locale): SimDefinitionTranslation | undefined {
  return (
    sim.translations.find((t) => t.locale === locale) ??
    sim.translations.find((t) => t.locale === "vi") ??
    sim.translations[0]
  );
}

async function findSim(idOrSlug: string): Promise<SimWithTr> {
  const sim = await prisma.simDefinition.findFirst({
    where: { status: "PUBLISHED", OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { translations: true },
  });
  if (!sim) throw notFound("Simulation");
  return sim;
}

/** unlockRule: null → unlocked; { lessonSlug } → that lesson completed; { courseSlug } → course completed. */
async function isLocked(sim: SimDefinition, userId: string | null): Promise<{ locked: boolean; lockReason: string | null }> {
  const rule = sim.unlockRule as { lessonSlug?: string; courseSlug?: string } | null;
  if (!rule || (!rule.lessonSlug && !rule.courseSlug)) return { locked: false, lockReason: null };
  if (!userId) return { locked: true, lockReason: "LOGIN_REQUIRED" };
  if (rule.lessonSlug) {
    const done = await prisma.lessonProgress.findFirst({
      where: { userId, status: "COMPLETED", lesson: { slug: rule.lessonSlug } },
    });
    if (!done) return { locked: true, lockReason: "COMPLETE_LESSON_FIRST" };
  }
  if (rule.courseSlug) {
    const done = await prisma.enrollment.findFirst({
      where: { userId, completedAt: { not: null }, course: { slug: rule.courseSlug } },
    });
    if (!done) return { locked: true, lockReason: "COMPLETE_COURSE_FIRST" };
  }
  return { locked: false, lockReason: null };
}

async function simSummary(sim: SimWithTr, userId: string | null, locale: Locale) {
  const tr = pickTr(sim, locale);
  const lock = await isLocked(sim, userId);
  const active = userId
    ? await prisma.simSession.findFirst({
        where: { userId, simId: sim.id, status: "ACTIVE" },
        select: { id: true },
      })
    : null;
  return {
    id: sim.id,
    slug: sim.slug,
    type: sim.type,
    title: tr?.title ?? sim.slug,
    subtitle: tr?.subtitle ?? "",
    estimatedMinutes: sim.estimatedMinutes,
    xpRewardComplete: sim.xpRewardComplete,
    order: sim.order,
    locked: lock.locked,
    lockReason: lock.lockReason,
    activeSessionId: active?.id ?? null,
  };
}

export async function listSims(userId: string | null, locale: Locale) {
  const sims = await prisma.simDefinition.findMany({
    where: { status: "PUBLISHED" },
    include: { translations: true },
    orderBy: { order: "asc" },
  });
  return Promise.all(sims.map((s) => simSummary(s, userId, locale)));
}

export async function getSim(idOrSlug: string, userId: string | null, locale: Locale) {
  const sim = await findSim(idOrSlug);
  const tr = pickTr(sim, locale);
  const bundle = (tr?.textBundle ?? {}) as TextBundle;
  const howToPlay = Array.isArray(bundle["how_to_play"]) ? (bundle["how_to_play"] as string[]) : [];
  return {
    ...(await simSummary(sim, userId, locale)),
    description: tr?.description ?? "",
    howToPlay,
  };
}

function sessionView(session: SimSession, sim: SimWithTr, locale: Locale, extras?: EngineJson) {
  const engine = getEngine(sim.type);
  const tr = pickTr(sim, locale);
  const bundle = (tr?.textBundle ?? {}) as TextBundle;
  const state = session.state as EngineJson;
  const config = sim.config as EngineJson;
  return {
    id: session.id,
    simId: sim.id,
    simSlug: sim.slug,
    simType: sim.type,
    status: session.status,
    turnNumber: session.turnNumber,
    stateVersion: session.stateVersion,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    view: engine.view(state, config, bundle),
    availableActions: session.status === "ACTIVE" ? engine.availableActions(state, config) : [],
    ...(session.summary ? { summary: session.summary } : {}),
    meta: { disclaimer: "simulated" },
    ...(extras ?? {}),
  };
}

/** POST /sims/:idOrSlug/sessions - one ACTIVE session per (user, sim). */
export async function createSession(userId: string, idOrSlug: string, optionsKey: string, now: Clock) {
  const sim = await findSim(idOrSlug);
  const lock = await isLocked(sim, userId);
  if (lock.locked) throw ruleViolation("SIM_LOCKED", lock.lockReason ?? undefined);

  const active = await prisma.simSession.findFirst({
    where: { userId, simId: sim.id, status: "ACTIVE" },
  });
  if (active) {
    throw conflict("Bạn đã có một phiên đang chạy cho mô phỏng này.", [
      { path: "sessionId", message: active.id },
    ]);
  }

  const engine = getEngine(sim.type);
  const seed = randomInt(2 ** 31);
  const state = engine.init(sim.config as EngineJson, seed, optionsKey);
  const session = await prisma.simSession.create({
    data: {
      id: uuidv7(),
      userId,
      simId: sim.id,
      configVersionUsed: sim.configVersion,
      seed,
      state: state as Prisma.InputJsonValue,
      startedAt: now(),
    },
  });
  return sessionView(session, sim, "vi");
}

async function findOwnSession(userId: string, sessionId: string) {
  const session = await prisma.simSession.findFirst({
    where: { id: sessionId, userId },
    include: { sim: { include: { translations: true } } },
  });
  if (!session) throw notFound("Session");
  return session;
}

export async function getSession(userId: string, sessionId: string, locale: Locale) {
  const session = await findOwnSession(userId, sessionId);
  return sessionView(session, session.sim, locale);
}

/** POST /sims/sessions/:id/actions - the one-transaction turn (doc 04 §1.2). */
export async function postAction(
  userId: string,
  sessionId: string,
  expectedStateVersion: number,
  action: EngineJson,
  now: Clock,
  locale: Locale,
) {
  const at = now();
  const acc: Awards = emptyAwards();

  const { session, sim, resultDelta, turnReport } = await prisma.$transaction(async (tx) => {
    // Row lock so concurrent actions serialize
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM sim_session WHERE id = ${sessionId} AND "userId" = ${userId} FOR UPDATE`;
    if (locked.length === 0) throw notFound("Session");

    const session = await tx.simSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { sim: { include: { translations: true } } },
    });
    if (session.status !== "ACTIVE") throw invalidState("Phiên mô phỏng không còn hoạt động.");
    if (session.stateVersion !== expectedStateVersion) throw versionConflict();

    const sim = session.sim;
    const engine = getEngine(sim.type);
    const config = sim.config as EngineJson;
    const rng = turnRng(session.seed, session.turnNumber);
    const applied = engine.applyAction(session.state as EngineJson, config, action, rng);

    const newTurnNumber = session.turnNumber + (applied.turnAdvanced ? 1 : 0);
    const finish = engine.isFinished(applied.state, config);

    // Action log row (actionIndex = per-turn counter)
    const actionIndex = await tx.simActionLog.count({
      where: { sessionId, turnNumber: session.turnNumber },
    });
    await tx.simActionLog.create({
      data: {
        id: uuidv7(),
        sessionId,
        turnNumber: session.turnNumber,
        actionIndex,
        actionType: String(action.type ?? ""),
        payload: action as Prisma.InputJsonValue,
        resultDelta: applied.resultDelta as Prisma.InputJsonValue,
        createdAt: at,
      },
    });

    // Awards - all in this same transaction
    if (applied.turnAdvanced && newTurnNumber <= SIM_TURN_MAX_TURNS) {
      await grantXp(tx, userId, SIM_TURN_XP, "SIM_TURN", "sim_session", `${sessionId}:${newTurnNumber}`, at, acc);
    }
    if (applied.turnAdvanced) {
      await bumpQuest(tx, userId, "q_sim_turns_3", 1, at, acc);
      await touchStreak(tx, userId, at, acc);
    }

    let summary: EngineJson | undefined;
    if (finish.finished) {
      summary = finish.summary ?? {};
      if (finish.status === "COMPLETED") {
        const granted = await grantXp(tx, userId, sim.xpRewardComplete, "SIM_COMPLETE", "sim", sim.id, at, acc);
        if (granted > 0) {
          await tx.userStats.update({
            where: { userId },
            data: { simsCompleted: { increment: 1 } },
          });
        }
        const badge = summary.awardBadge;
        if (typeof badge === "string" && badge) {
          await awardBadgeByCode(tx, userId, badge, at, acc);
        }
      }
    }
    if (acc.xp > 0) await bumpQuest(tx, userId, "q_earn_xp_50", acc.xp, at, acc);

    const updated = await tx.simSession.update({
      where: { id: sessionId },
      data: {
        state: applied.state as Prisma.InputJsonValue,
        stateVersion: session.stateVersion + 1,
        turnNumber: newTurnNumber,
        ...(finish.finished
          ? {
              status: finish.status,
              endedAt: at,
              summary: summary as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
    return { session: updated, sim, resultDelta: applied.resultDelta, turnReport: applied.turnReport };
  });

  return {
    ...sessionView(session, sim, locale, {
      resultDelta,
      ...(turnReport ? { turnReport } : {}),
    }),
    awards: acc,
  };
}

export async function abandonSession(userId: string, sessionId: string) {
  const session = await findOwnSession(userId, sessionId);
  if (session.status !== "ACTIVE") throw invalidState("Phiên mô phỏng không còn hoạt động.");
  await prisma.simSession.update({
    where: { id: session.id },
    data: { status: "ABANDONED", endedAt: new Date() },
  });
  return { status: "ABANDONED" as const };
}

export async function listHistory(userId: string, simId: string | undefined, cursor: string | undefined, limit: number) {
  const sessions = await prisma.simSession.findMany({
    where: { userId, ...(simId ? { simId } : {}), ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: { sim: { select: { slug: true } } },
  });
  const hasMore = sessions.length > limit;
  const page = sessions.slice(0, limit);
  return {
    items: page.map((s) => ({
      sessionId: s.id,
      simSlug: s.sim.slug,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      summary: s.summary,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export async function getLog(userId: string, role: "LEARNER" | "ADMIN", sessionId: string) {
  const session = await prisma.simSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound("Session");
  if (session.userId !== userId && role !== "ADMIN") throw notFound("Session"); // hide existence
  const rows = await prisma.simActionLog.findMany({
    where: { sessionId },
    orderBy: [{ turnNumber: "asc" }, { actionIndex: "asc" }],
  });
  return rows.map((r) => ({
    turnNumber: r.turnNumber,
    actionIndex: r.actionIndex,
    actionType: r.actionType,
    payload: r.payload,
    resultDelta: r.resultDelta,
    createdAt: r.createdAt.toISOString(),
  }));
}
