import type { Locale, Prisma, TutorContextType, TutorThread } from "@prisma/client";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { logger } from "@/server/lib/logger";
import { forbidden, notFound, ruleViolation, AppError } from "@/server/lib/errors";
import { isFlagEnabled } from "@/server/lib/flags";
import { vnDate, secondsUntilVnMidnight } from "@/server/lib/time";
import { env } from "@/server/config";
import { chat, UpstreamError } from "@/server/lib/anthropic";
import { getEngine } from "@/server/engines";
import type { EngineJson, TextBundle } from "@/server/engines/types";
import { TUTOR_DISCLAIMER, TUTOR_SYSTEM_PROMPT, contextBlock } from "@/server/services/tutorPrompt";

// AI Tutor - doc 03 §9. Synchronous (no streaming), hard daily cap per VN day,
// thread capped at 40 messages, context is lesson/sim only (never profile data).

export const MAX_MESSAGES_PER_THREAD = 40;
const HISTORY_TURNS = 20; // messages sent back to the model
const MAX_CONTEXT_CHARS = 6000;

export const FLAG_KEY = "ai_tutor_enabled";

export interface TutorThreadView {
  id: string;
  contextType: TutorContextType;
  contextId: string | null;
  contextTitle: string | null;
  title: string | null;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

function threadDto(t: TutorThread, contextTitle: string | null): TutorThreadView {
  return {
    id: t.id,
    contextType: t.contextType,
    contextId: t.contextId,
    contextTitle,
    title: t.title,
    messageCount: t.messageCount,
    lastMessageAt: t.lastMessageAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
  };
}

function messageDto(m: { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: Date }) {
  return { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() };
}

async function assertEnabled(): Promise<void> {
  if (!(await isFlagEnabled(FLAG_KEY))) throw forbidden("TUTOR_DISABLED");
}

// ── Context resolution ───────────────────────────────────────────────────────

/** Title shown in the thread list; also validates that the context still exists. */
async function contextTitleFor(
  contextType: TutorContextType,
  contextId: string | null,
  userId: string,
  locale: Locale,
): Promise<string | null> {
  if (contextType === "GENERAL" || !contextId) return null;
  if (contextType === "LESSON") {
    const lesson = await prisma.lesson.findFirst({
      where: { id: contextId, status: "PUBLISHED" },
      select: { translations: { where: { locale: { in: [locale, "vi"] } }, select: { locale: true, title: true } } },
    });
    if (!lesson) return null;
    const tr = lesson.translations.find((t) => t.locale === locale) ?? lesson.translations[0];
    return tr?.title ?? null;
  }
  const session = await prisma.simSession.findFirst({
    where: { id: contextId, userId },
    select: { sim: { select: { slug: true, translations: { where: { locale: { in: [locale, "vi"] } }, select: { locale: true, title: true } } } } },
  });
  if (!session) return null;
  const tr = session.sim.translations.find((t) => t.locale === locale) ?? session.sim.translations[0];
  return tr?.title ?? session.sim.slug;
}

type Block = { type: string; [k: string]: unknown };

/** Plain-text extraction of lesson blocks for the model (doc 03 §9.4 step 3). */
export function blocksToPlainText(blocks: unknown, maxChars = MAX_CONTEXT_CHARS): string {
  if (!Array.isArray(blocks)) return "";
  const out: string[] = [];
  for (const raw of blocks as Block[]) {
    switch (raw.type) {
      case "HEADING":
        out.push(`## ${String(raw.text ?? "")}`);
        break;
      case "PARAGRAPH":
      case "EXAMPLE":
        out.push(String(raw.text ?? ""));
        break;
      case "LIST": {
        const items = Array.isArray(raw.items) ? (raw.items as string[]) : [];
        out.push(items.map((i) => `- ${i}`).join("\n"));
        break;
      }
      case "CALLOUT":
        out.push(`[${String(raw.variant ?? "INFO")}] ${String(raw.text ?? "")}`);
        break;
      case "KEY_TERM":
        out.push(`${String(raw.term ?? "")}: ${String(raw.definition ?? "")}`);
        break;
      case "TABLE": {
        const headers = Array.isArray(raw.headers) ? (raw.headers as string[]) : [];
        const rows = Array.isArray(raw.rows) ? (raw.rows as string[][]) : [];
        out.push([headers.join(" | "), ...rows.map((r) => r.join(" | "))].join("\n"));
        break;
      }
      case "IMAGE": {
        const caption = typeof raw.caption === "string" ? ` - ${raw.caption}` : "";
        out.push(`[Hình: ${String(raw.alt ?? "")}${caption}]`);
        break;
      }
      case "VIDEO": {
        if (typeof raw.caption === "string") out.push(`[Video: ${raw.caption}]`);
        break;
      }
      case "CHECK_QUESTION": {
        const q = raw.question as { prompt?: string } | undefined;
        if (q?.prompt) out.push(`[Câu hỏi kiểm tra] ${q.prompt}`);
        break;
      }
      // DIVIDER, CALCULATOR and SIM_LINK carry no teachable text
      default:
        break;
    }
    if (out.join("\n\n").length > maxChars) break;
  }
  const text = out.join("\n\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/** Build the CONTEXT block body for a thread. Returns null for GENERAL / missing context. */
async function buildContext(
  thread: TutorThread,
  locale: Locale,
): Promise<{ title: string; body: string } | null> {
  if (thread.contextType === "GENERAL" || !thread.contextId) return null;

  if (thread.contextType === "LESSON") {
    const lesson = await prisma.lesson.findFirst({
      where: { id: thread.contextId, status: "PUBLISHED" },
      select: {
        translations: {
          where: { locale: { in: [locale, "vi"] } },
          select: { locale: true, title: true, blocks: true },
        },
      },
    });
    if (!lesson) return null;
    const tr = lesson.translations.find((t) => t.locale === locale) ?? lesson.translations[0];
    if (!tr) return null;
    return { title: `Bài học "${tr.title}"`, body: blocksToPlainText(tr.blocks) };
  }

  const session = await prisma.simSession.findFirst({
    where: { id: thread.contextId, userId: thread.userId },
    include: {
      sim: { include: { translations: { where: { locale: { in: [locale, "vi"] } } } } },
    },
  });
  if (!session) return null;
  const tr = session.sim.translations.find((t) => t.locale === locale) ?? session.sim.translations[0];
  const engine = getEngine(session.sim.type);
  let viewJson = "{}";
  try {
    const view = engine.view(
      session.state as EngineJson,
      session.sim.config as EngineJson,
      (tr?.textBundle ?? {}) as TextBundle,
    );
    viewJson = JSON.stringify(view);
  } catch {
    // A malformed state must not break the tutor - fall back to no view.
  }
  const log = await prisma.simActionLog.findMany({
    where: { sessionId: session.id },
    orderBy: [{ turnNumber: "desc" }, { actionIndex: "desc" }],
    take: 5,
    select: { turnNumber: true, actionType: true, payload: true, resultDelta: true },
  });
  const body = [
    `Trạng thái hiện tại (JSON): ${viewJson}`,
    `5 hành động gần nhất: ${JSON.stringify(log.reverse())}`,
  ]
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);
  return { title: `Mô phỏng "${tr?.title ?? session.sim.slug}"`, body };
}

// ── 9.1 create thread ────────────────────────────────────────────────────────

export async function createThread(
  userId: string,
  input: { contextType: TutorContextType; contextId?: string | null },
  locale: Locale,
  now: Date,
): Promise<TutorThreadView> {
  await assertEnabled();
  const contextId = input.contextId ?? null;
  if (input.contextType !== "GENERAL" && !contextId) throw ruleViolation("CONTEXT_REQUIRED");

  const contextTitle = await contextTitleFor(input.contextType, contextId, userId, locale);
  if (input.contextType !== "GENERAL" && contextTitle === null) {
    throw notFound(input.contextType === "LESSON" ? "Lesson" : "Sim session");
  }

  const thread = await prisma.tutorThread.create({
    data: {
      id: uuidv7(),
      userId,
      contextType: input.contextType,
      contextId,
      title: contextTitle,
      lastMessageAt: now,
      createdAt: now,
    },
  });
  return threadDto(thread, contextTitle);
}

// ── 9.2 list threads ─────────────────────────────────────────────────────────

export async function listThreads(userId: string, cursor: string | undefined, limit = 20) {
  await assertEnabled();
  const rows = await prisma.tutorThread.findMany({
    where: { userId, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { id: "desc" },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map((t) => threadDto(t, t.title)),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    hasMore,
  };
}

// ── 9.3 get thread ───────────────────────────────────────────────────────────

async function ownThread(userId: string, threadId: string): Promise<TutorThread> {
  const thread = await prisma.tutorThread.findFirst({ where: { id: threadId, userId } });
  if (!thread) throw notFound("Thread"); // 404 (not 403) so ids can't be probed
  return thread;
}

export async function getThread(userId: string, threadId: string) {
  await assertEnabled();
  const thread = await ownThread(userId, threadId);
  const messages = await prisma.tutorMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: MAX_MESSAGES_PER_THREAD,
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return { ...threadDto(thread, thread.title), messages: messages.map(messageDto) };
}

// ── 9.5 delete thread ────────────────────────────────────────────────────────

export async function deleteThread(userId: string, threadId: string): Promise<void> {
  await assertEnabled();
  await ownThread(userId, threadId);
  await prisma.tutorThread.delete({ where: { id: threadId } }); // messages cascade
}

// ── 9.6 usage ────────────────────────────────────────────────────────────────

export async function getUsage(userId: string, now: Date) {
  await assertEnabled();
  const limitPerDay = env().AI_TUTOR_DAILY_MSG_LIMIT;
  const row = await prisma.tutorUsage.findUnique({
    where: { userId_usageDate: { userId, usageDate: vnDate(now) } },
    select: { messageCount: true },
  });
  const usedToday = row?.messageCount ?? 0;
  return { usedToday, limitPerDay, remainingToday: Math.max(0, limitPerDay - usedToday) };
}

// ── 9.4 send message ─────────────────────────────────────────────────────────

export async function sendMessage(
  userId: string,
  threadId: string,
  content: string,
  locale: Locale,
  now: Date,
) {
  // 1. flag → ownership → thread not full
  await assertEnabled();
  const thread = await ownThread(userId, threadId);
  if (thread.messageCount >= MAX_MESSAGES_PER_THREAD) throw ruleViolation("THREAD_FULL");

  // 2. reserve one message against today's VN quota (atomic; released on upstream failure)
  const limitPerDay = env().AI_TUTOR_DAILY_MSG_LIMIT;
  const usageDate = vnDate(now);
  const usage = await prisma.$transaction(async (tx) => {
    const row = await tx.tutorUsage.upsert({
      where: { userId_usageDate: { userId, usageDate } },
      create: { userId, usageDate, messageCount: 1 },
      update: { messageCount: { increment: 1 } },
      select: { messageCount: true },
    });
    if (row.messageCount > limitPerDay) {
      // Throwing rolls the increment back, so the counter parks exactly at the limit.
      throw new AppError("RATE_LIMITED", "Bạn đã đạt giới hạn tin nhắn trợ giảng trong ngày.", {
        retryAfterSec: secondsUntilVnMidnight(now),
      });
    }
    return row;
  });

  // 3. context + history
  const [ctx, history] = await Promise.all([
    buildContext(thread, locale),
    prisma.tutorMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
      select: { role: true, content: true },
    }),
  ]);

  const messages = history
    .reverse()
    .map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content }));
  // Context rides on the newest user turn so it stays fresh as the sim state changes.
  messages.push({ role: "user", content: `${contextBlock(ctx)}${content}` });

  // 4. call Claude
  let completion;
  try {
    completion = await chat({
      system: TUTOR_SYSTEM_PROMPT,
      messages,
      maxTokens: 1024,
      temperature: 0.3,
    });
  } catch (e) {
    // Nothing is persisted, and the reserved quota unit is refunded - retry is clean.
    await prisma.tutorUsage
      .update({
        where: { userId_usageDate: { userId, usageDate } },
        data: { messageCount: { decrement: 1 } },
      })
      .catch(() => undefined);
    if (e instanceof UpstreamError) {
      logger.error({ userId, err: e.message }, "tutor upstream failure");
      throw new AppError("INTERNAL", "TUTOR_UPSTREAM", { httpStatus: 502 });
    }
    throw e;
  }

  // 5. append disclaimer + persist both messages atomically
  const answer = completion.text.includes(TUTOR_DISCLAIMER)
    ? completion.text
    : `${completion.text}\n\n${TUTOR_DISCLAIMER}`;

  const assistantAt = new Date(now.getTime() + 1); // keeps createdAt ordering stable
  const [userMessage, assistantMessage] = await prisma.$transaction(async (tx) => {
    const um = await tx.tutorMessage.create({
      data: { id: uuidv7(), threadId, role: "USER", content, createdAt: now },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    const am = await tx.tutorMessage.create({
      data: {
        id: uuidv7(),
        threadId,
        role: "ASSISTANT",
        content: answer,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        model: completion.model,
        createdAt: assistantAt,
      },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    const data: Prisma.TutorThreadUpdateInput = {
      messageCount: { increment: 2 },
      lastMessageAt: assistantAt,
    };
    // GENERAL threads have no context title - name them after the first question.
    if (!thread.title) data.title = content.slice(0, 60);
    await tx.tutorThread.update({ where: { id: threadId }, data });
    return [um, am] as const;
  });

  return {
    userMessage: messageDto(userMessage),
    assistantMessage: messageDto(assistantMessage),
    remainingToday: Math.max(0, limitPerDay - usage.messageCount),
  };
}
