import { z } from "zod";
import { prisma } from "@/server/db";
import { isEventName } from "@/server/lib/meta";

// Product-analytics ingest - doc 03 §11. Never 4xx the whole batch for one bad event:
// good events are stored, bad ones come back in `rejected` so the client can drop them.

const MAX_PROPS_BYTES = 2048;
const TS_SKEW_MS = 48 * 3600 * 1000;

export const eventsBody = z.object({
  anonymousId: z.string().max(64).optional(),
  sessionId: z.string().min(1).max(64),
  appVersion: z.string().max(40).optional(),
  events: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        ts: z.string().min(1).max(40),
        props: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export async function ingestEvents(
  userId: string | null,
  input: z.infer<typeof eventsBody>,
  now: Date,
) {
  const rejected: Array<{ index: number; reason: string }> = [];
  const rows: Array<{
    userId: string | null;
    anonymousId: string | null;
    sessionId: string;
    name: string;
    ts: Date;
    props: object;
    appVersion: string | null;
  }> = [];

  for (const [index, e] of input.events.entries()) {
    if (!isEventName(e.name)) {
      rejected.push({ index, reason: "UNKNOWN_EVENT_NAME" });
      continue;
    }
    const parsed = new Date(e.ts);
    if (Number.isNaN(parsed.getTime())) {
      rejected.push({ index, reason: "INVALID_TS" });
      continue;
    }
    const props = e.props ?? {};
    if (JSON.stringify(props).length > MAX_PROPS_BYTES) {
      rejected.push({ index, reason: "PROPS_TOO_LARGE" });
      continue;
    }
    // Clamp instead of reject: clock-skewed devices are common and the event is still useful.
    const clamped = new Date(
      Math.min(Math.max(parsed.getTime(), now.getTime() - TS_SKEW_MS), now.getTime() + TS_SKEW_MS),
    );
    rows.push({
      userId, // stamped from auth; a client-supplied userId is ignored
      anonymousId: input.anonymousId ?? null,
      sessionId: input.sessionId,
      name: e.name,
      ts: clamped,
      props,
      appVersion: input.appVersion ?? null,
    });
  }

  if (rows.length > 0) {
    await prisma.event.createMany({ data: rows });
  }
  return { accepted: rows.length, rejected };
}
