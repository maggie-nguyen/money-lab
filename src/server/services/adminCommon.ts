import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { AppError, versionConflict } from "@/server/lib/errors";
import type { ApiCtx } from "@/server/http";

// Shared plumbing for /admin/* - doc 03 §14.
// Every admin mutation calls writeAudit; every PATCH goes through assertIfMatch.

export interface AdminActor {
  id: string;
  ip: string | null;
}

/** Weak etag = updatedAt epoch millis. Sent in the DTO and required back via If-Match. */
export function etagOf(updatedAt: Date): string {
  return String(updatedAt.getTime());
}

/**
 * Optimistic concurrency for two admins editing the same row (doc 03 §14.1).
 * `updatedAt` is null for models without the column - those skip the check.
 */
export function assertIfMatch(ifMatch: string | null, updatedAt: Date | null): void {
  if (updatedAt === null) return;
  if (!ifMatch) throw versionConflict("If-Match header required");
  if (ifMatch.replace(/^W\//, "").replace(/"/g, "") !== etagOf(updatedAt)) {
    throw versionConflict("Content changed since you loaded it");
  }
}

export async function writeAudit(
  db: Tx | typeof prisma,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  ip: string | null,
  now: Date,
): Promise<void> {
  await db.auditLog.create({
    data: {
      id: uuidv7(),
      actorId,
      action,
      entityType,
      entityId,
      before: before === undefined ? undefined : JSON.parse(JSON.stringify(before)),
      after: after === undefined ? undefined : JSON.parse(JSON.stringify(after)),
      ip,
      createdAt: now,
    },
  });
}

/** Common list query - doc 03 §14: `?status=&locale=&cursor=&limit=&q=`. */
export const adminListQuery = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  locale: z.enum(["vi", "en"]).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});
export type AdminListQuery = z.infer<typeof adminListQuery>;

/**
 * Admin services run their own Zod parse (schemas vary per resource), so routes hand
 * them the raw JSON body - this only guards against malformed JSON itself.
 */
export async function readJsonBody(ctx: ApiCtx): Promise<unknown> {
  try {
    return await ctx.req.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON");
  }
}

/** Keyset page over rows already ordered desc by id. */
export function pageOf<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return { page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}
