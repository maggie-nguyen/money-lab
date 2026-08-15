import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { AppError, notFound, ruleViolation } from "@/server/lib/errors";
import { resetFlagCache, FLAG_DEFAULTS } from "@/server/lib/flags";
import { levelForXp } from "@/server/services/gamificationService";
import { pageOf, writeAudit, type AdminActor } from "@/server/services/adminCommon";

// Admin operations - users, feedback, surveys, flags, audit log, certificates,
// gamification adjustments, media uploads (doc 03 §14.2–14.6).

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid body", {
      details: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return r.data;
}

// ── Users ────────────────────────────────────────────────────────────────────

export const adminUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(["LEARNER", "ADMIN"]).optional(),
  status: z.enum(["active", "banned", "deleted"]).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuery>;

function userDto(u: {
  id: string;
  email: string | null;
  displayName: string;
  role: string;
  province: string | null;
  localePref: string;
  lastActiveAt: Date;
  bannedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  stats?: { xpTotal: number; coins: number; streakCurrent: number } | null;
}) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    province: u.province,
    localePref: u.localePref,
    lastActiveAt: u.lastActiveAt.toISOString(),
    bannedAt: u.bannedAt?.toISOString() ?? null,
    deletedAt: u.deletedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    stats: u.stats
      ? { xpTotal: u.stats.xpTotal, coins: u.stats.coins, streakCurrent: u.stats.streakCurrent }
      : null,
  };
}

export async function listUsers(q: AdminUsersQuery) {
  const rows = await prisma.user.findMany({
    where: {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status === "banned"
        ? { bannedAt: { not: null } }
        : q.status === "deleted"
          ? { deletedAt: { not: null } }
          : q.status === "active"
            ? { bannedAt: null, deletedAt: null }
            : {}),
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: "insensitive" } },
              { displayName: { contains: q.q, mode: "insensitive" } },
              { id: q.q },
            ],
          }
        : {}),
      ...(q.cursor ? { id: { lt: q.cursor } } : {}),
    },
    include: { stats: true },
    orderBy: { id: "desc" },
    take: q.limit + 1,
  });
  const { page, nextCursor } = pageOf(rows, q.limit);
  return { data: page.map(userDto), nextCursor };
}

export async function getUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, include: { stats: true } });
  if (!u) throw notFound("User");
  return userDto(u);
}

const userPatchBody = z
  .object({
    role: z.enum(["LEARNER", "ADMIN"]).optional(),
    displayName: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export async function patchUser(id: string, body: unknown, actor: AdminActor, now: Date) {
  const b = parse(userPatchBody, body);
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw notFound("User");
  if (before.deletedAt) throw ruleViolation("USER_DELETED", "Cannot edit a deleted user");
  // Self-demotion lockout guard: never allow removing the last admin.
  if (b.role === "LEARNER" && before.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN", deletedAt: null, bannedAt: null } });
    if (admins <= 1) throw ruleViolation("LAST_ADMIN", "Cannot demote the last admin");
  }
  const u = await prisma.user.update({ where: { id }, data: b, include: { stats: true } });
  await writeAudit(
    prisma, actor.id, "update", "user", id,
    { role: before.role, displayName: before.displayName },
    { role: u.role, displayName: u.displayName },
    actor.ip, now,
  );
  return userDto(u);
}

const banBody = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export async function banUser(id: string, body: unknown, actor: AdminActor, now: Date) {
  const b = parse(banBody, body);
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw notFound("User");
  if (before.id === actor.id) throw ruleViolation("SELF_BAN", "You cannot ban yourself");
  if (before.role === "ADMIN") throw ruleViolation("ADMIN_BAN", "Demote the admin first");
  if (before.bannedAt) throw ruleViolation("ALREADY_BANNED", "User is already banned");
  const [u] = await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { bannedAt: now }, include: { stats: true } }),
    prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  await writeAudit(prisma, actor.id, "ban", "user", id, { bannedAt: null }, { bannedAt: now.toISOString(), reason: b.reason }, actor.ip, now);
  return userDto(u);
}

export async function unbanUser(id: string, actor: AdminActor, now: Date) {
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw notFound("User");
  if (!before.bannedAt) throw ruleViolation("NOT_BANNED", "User is not banned");
  const u = await prisma.user.update({ where: { id }, data: { bannedAt: null }, include: { stats: true } });
  await writeAudit(prisma, actor.id, "unban", "user", id, { bannedAt: before.bannedAt.toISOString() }, { bannedAt: null }, actor.ip, now);
  return userDto(u);
}

/** Same anonymize-now/purge-later pipeline the learner self-delete uses (doc 03 §3.7). */
export async function adminDeleteUser(id: string, actor: AdminActor, now: Date) {
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw notFound("User");
  if (before.id === actor.id) throw ruleViolation("SELF_DELETE", "Use DELETE /me for your own account");
  if (before.deletedAt) throw ruleViolation("ALREADY_DELETED", "User is already deleted");
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        deletedAt: now,
        email: null,
        passwordHash: null,
        displayName: "Người dùng đã xóa",
        avatarKey: null,
        birthYear: null,
        province: null,
      },
    }),
    prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
    prisma.oauthAccount.deleteMany({ where: { userId: id } }),
  ]);
  await writeAudit(prisma, actor.id, "delete", "user", id, { email: before.email }, null, actor.ip, now);
}

// ── Gamification adjust ──────────────────────────────────────────────────────

const adjustBody = z
  .object({
    userId: z.string().min(1),
    xpDelta: z.number().int().min(-10000).max(10000).default(0),
    coinDelta: z.number().int().min(-10000).max(10000).default(0),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine((b) => b.xpDelta !== 0 || b.coinDelta !== 0, { message: "Nothing to adjust" });

export async function adjustGamification(body: unknown, actor: AdminActor, now: Date) {
  const b = parse(adjustBody, body);
  const user = await prisma.user.findUnique({ where: { id: b.userId }, include: { stats: true } });
  if (!user || user.deletedAt) throw notFound("User");
  if (b.coinDelta < 0 && (user.stats?.coins ?? 0) + b.coinDelta < 0) {
    throw ruleViolation("INSUFFICIENT_COINS", "Adjustment would make coins negative");
  }
  // grantXp/grantCoins reject non-positive deltas, and admin corrections can be negative -
  // write the ledgers directly. refId is a fresh uuid, so the anti-double-award unique
  // (userId, reason, refType, refId) never collides here.
  const refId = uuidv7();
  await prisma.$transaction(async (tx) => {
    if (b.xpDelta !== 0) {
      await tx.xpLedger.create({
        data: { id: uuidv7(), userId: b.userId, delta: b.xpDelta, reason: "ADMIN_ADJUST", refType: "admin", refId, createdAt: now },
      });
    }
    if (b.coinDelta !== 0) {
      await tx.coinLedger.create({
        data: { id: uuidv7(), userId: b.userId, delta: b.coinDelta, reason: "ADMIN_ADJUST", refType: "admin", refId, createdAt: now },
      });
    }
    const stats = await tx.userStats.update({
      where: { userId: b.userId },
      data: {
        ...(b.xpDelta !== 0 ? { xpTotal: { increment: b.xpDelta } } : {}),
        ...(b.coinDelta !== 0 ? { coins: { increment: b.coinDelta } } : {}),
      },
    });
    if (b.xpDelta !== 0) {
      await tx.userStats.update({ where: { userId: b.userId }, data: { level: levelForXp(stats.xpTotal) } });
    }
  });
  await writeAudit(
    prisma, actor.id, "adjust", "user", b.userId,
    null, { xpDelta: b.xpDelta, coinDelta: b.coinDelta, reason: b.reason, refId },
    actor.ip, now,
  );
  const stats = await prisma.userStats.findUnique({ where: { userId: b.userId } });
  return { userId: b.userId, xpTotal: stats?.xpTotal ?? 0, coins: stats?.coins ?? 0, refId };
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export const feedbackQuery = z.object({
  resolved: z.enum(["true", "false"]).optional(),
  kind: z.enum(["BUG", "CONTENT_ERROR", "SUGGESTION", "PRAISE", "OTHER"]).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function feedbackDto(f: {
  id: string;
  userId: string | null;
  kind: string;
  screenPath: string | null;
  entityType: string | null;
  entityId: string | null;
  body: string;
  screenshotUrl: string | null;
  appVersion: string | null;
  resolvedAt: Date | null;
  resolverId: string | null;
  resolutionNote: string | null;
  createdAt: Date;
}) {
  return {
    id: f.id,
    userId: f.userId,
    kind: f.kind,
    screenPath: f.screenPath,
    entityType: f.entityType,
    entityId: f.entityId,
    body: f.body,
    screenshotUrl: f.screenshotUrl,
    appVersion: f.appVersion,
    resolvedAt: f.resolvedAt?.toISOString() ?? null,
    resolverId: f.resolverId,
    resolutionNote: f.resolutionNote,
    createdAt: f.createdAt.toISOString(),
  };
}

export async function listFeedback(q: z.infer<typeof feedbackQuery>) {
  const rows = await prisma.feedback.findMany({
    where: {
      ...(q.resolved === "true" ? { resolvedAt: { not: null } } : q.resolved === "false" ? { resolvedAt: null } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.cursor ? { id: { lt: q.cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: q.limit + 1,
  });
  const { page, nextCursor } = pageOf(rows, q.limit);
  return { data: page.map(feedbackDto), nextCursor };
}

const feedbackPatchBody = z
  .object({
    resolved: z.boolean(),
    resolutionNote: z.string().trim().max(1000).optional(),
  })
  .strict();

export async function patchFeedback(id: string, body: unknown, actor: AdminActor, now: Date) {
  const b = parse(feedbackPatchBody, body);
  const before = await prisma.feedback.findUnique({ where: { id } });
  if (!before) throw notFound("Feedback");
  const f = await prisma.feedback.update({
    where: { id },
    data: b.resolved
      ? { resolvedAt: before.resolvedAt ?? now, resolverId: actor.id, resolutionNote: b.resolutionNote ?? before.resolutionNote }
      : { resolvedAt: null, resolverId: null, resolutionNote: b.resolutionNote ?? null },
  });
  await writeAudit(prisma, actor.id, "update", "feedback", id, { resolvedAt: before.resolvedAt }, { resolvedAt: f.resolvedAt }, actor.ip, now);
  return feedbackDto(f);
}

// ── Survey responses ─────────────────────────────────────────────────────────

export const surveyResponsesQuery = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  format: z.enum(["json", "csv"]).default("json"),
});

export async function listSurveyResponses(surveyId: string, q: z.infer<typeof surveyResponsesQuery>) {
  const survey = await prisma.survey.findUnique({ where: { id: surveyId }, include: { questions: true } });
  if (!survey) throw notFound("Survey");
  const rows = await prisma.surveyResponse.findMany({
    where: { surveyId, ...(q.cursor ? { id: { lt: q.cursor } } : {}) },
    orderBy: { id: "desc" },
    take: q.limit + 1,
  });
  const { page, nextCursor } = pageOf(rows, q.limit);
  return {
    survey: { id: survey.id, slug: survey.slug },
    data: page.map((r) => ({
      id: r.id,
      userId: r.userId,
      answers: r.answers,
      submittedAt: r.submittedAt.toISOString(),
    })),
    nextCursor,
  };
}

/** Full CSV export (no pagination): one column per question id, RFC 4180 quoting. */
export async function surveyResponsesCsv(surveyId: string): Promise<{ filename: string; csv: string }> {
  const survey = await prisma.survey.findUnique({ where: { id: surveyId }, include: { questions: { orderBy: { order: "asc" } } } });
  if (!survey) throw notFound("Survey");
  const rows = await prisma.surveyResponse.findMany({ where: { surveyId }, orderBy: { id: "asc" } });
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["responseId", "userId", "submittedAt", ...survey.questions.map((question) => `q${question.order}`)];
  const lines = [header.join(",")];
  for (const r of rows) {
    const answers = (r.answers ?? {}) as Record<string, unknown>;
    lines.push(
      [
        r.id,
        r.userId ?? "",
        r.submittedAt.toISOString(),
        ...survey.questions.map((question) => esc(answers[question.id])),
      ].join(","),
    );
  }
  return { filename: `survey-${survey.slug}-responses.csv`, csv: lines.join("\n") + "\n" };
}

// ── Feature flags ────────────────────────────────────────────────────────────

export async function listFlags() {
  const rows = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  const overridden = new Map(rows.map((r) => [r.key, r]));
  const keys = [...new Set([...Object.keys(FLAG_DEFAULTS), ...overridden.keys()])].sort();
  return {
    data: keys.map((key) => {
      const row = overridden.get(key);
      return {
        key,
        enabled: row?.enabled ?? FLAG_DEFAULTS[key] ?? false,
        payload: row?.payload ?? null,
        isDefault: !row,
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    }),
  };
}

const flagPutBody = z
  .object({
    enabled: z.boolean(),
    payload: z.record(z.string(), z.unknown()).nullish(),
  })
  .strict();
const flagKeySchema = z.string().regex(/^[a-z0-9_]{2,60}$/);

export async function putFlag(key: string, body: unknown, actor: AdminActor, now: Date) {
  const k = parse(flagKeySchema, key);
  const b = parse(flagPutBody, body);
  const before = await prisma.featureFlag.findUnique({ where: { key: k } });
  const flag = await prisma.featureFlag.upsert({
    where: { key: k },
    create: {
      key: k,
      enabled: b.enabled,
      payload: b.payload ? (JSON.parse(JSON.stringify(b.payload)) as object) : undefined,
      updatedBy: actor.id,
    },
    update: {
      enabled: b.enabled,
      payload: b.payload ? (JSON.parse(JSON.stringify(b.payload)) as object) : undefined,
      updatedBy: actor.id,
    },
  });
  resetFlagCache();
  await writeAudit(
    prisma, actor.id, "update", "feature_flag", k,
    before ? { enabled: before.enabled } : null, { enabled: flag.enabled },
    actor.ip, now,
  );
  return { key: flag.key, enabled: flag.enabled, payload: flag.payload ?? null, updatedAt: flag.updatedAt.toISOString() };
}

// ── Audit log ────────────────────────────────────────────────────────────────

export const auditQuery = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  actorId: z.string().max(64).optional(),
  action: z.string().max(40).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function listAuditLog(q: z.infer<typeof auditQuery>) {
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.cursor ? { id: { lt: q.cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: q.limit + 1,
  });
  const { page, nextCursor } = pageOf(rows, q.limit);
  return {
    data: page.map((a) => ({
      id: a.id,
      actorId: a.actorId,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      before: a.before,
      after: a.after,
      ip: a.ip,
      createdAt: a.createdAt.toISOString(),
    })),
    nextCursor,
  };
}

// ── Certificates ─────────────────────────────────────────────────────────────

const revokeBody = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export async function revokeCertificate(code: string, body: unknown, actor: AdminActor, now: Date) {
  const b = parse(revokeBody, body);
  const cert = await prisma.certificate.findUnique({ where: { code } });
  if (!cert) throw notFound("Certificate");
  if (cert.status === "REVOKED") throw ruleViolation("ALREADY_REVOKED", "Certificate already revoked");
  const updated = await prisma.certificate.update({
    where: { code },
    data: { status: "REVOKED", revokedAt: now },
  });
  await writeAudit(prisma, actor.id, "revoke", "certificate", cert.id, { status: "ACTIVE" }, { status: "REVOKED", reason: b.reason }, actor.ip, now);
  return { code: updated.code, status: updated.status, revokedAt: updated.revokedAt?.toISOString() ?? null };
}

// ── Media (local disk under public/uploads - lean, no S3) ───────────────────

const MEDIA_MAX_BYTES = 512_000;
const MEDIA_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  // image/svg+xml deliberately absent - SVG can carry scripts (stored XSS).
};
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const presignBody = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.string(),
    bytes: z.number().int().min(1),
  })
  .strict();

/**
 * "Presign" for local disk: reserve an asset id and hand back the PUT URL.
 * No DB row yet - confirm creates it after the bytes have landed.
 */
export function presignMedia(body: unknown) {
  const b = parse(presignBody, body);
  const ext = MEDIA_TYPES[b.mimeType];
  if (!ext) throw ruleViolation("UNSUPPORTED_MEDIA_TYPE", "Allowed: png, jpeg, webp, gif");
  if (b.bytes > MEDIA_MAX_BYTES) throw ruleViolation("MEDIA_TOO_LARGE", `Max ${MEDIA_MAX_BYTES} bytes`);
  const assetId = uuidv7();
  const filename = `${assetId}.${ext}`;
  return {
    assetId,
    uploadUrl: `/api/v1/admin/media/upload/${filename}`,
    publicUrl: `/uploads/${filename}`,
    maxBytes: MEDIA_MAX_BYTES,
    expiresInSec: 3600,
  };
}

const FILENAME_RE = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;

/** Body of the PUT route: write raw bytes to disk. Filename is fully validated (no traversal). */
export async function storeMediaFile(filename: string, bytes: Buffer): Promise<void> {
  if (!FILENAME_RE.test(filename)) throw notFound("Upload slot");
  if (bytes.length === 0) throw ruleViolation("EMPTY_BODY", "No bytes received");
  if (bytes.length > MEDIA_MAX_BYTES) throw ruleViolation("MEDIA_TOO_LARGE", `Max ${MEDIA_MAX_BYTES} bytes`);
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, filename), bytes);
}

const confirmBody = z
  .object({
    mimeType: z.string(),
    altText: z.string().trim().max(300).optional(),
    width: z.number().int().min(1).max(10000).optional(),
    height: z.number().int().min(1).max(10000).optional(),
  })
  .strict();

export async function confirmMedia(assetId: string, body: unknown, actor: AdminActor, now: Date) {
  const b = parse(confirmBody, body);
  const ext = MEDIA_TYPES[b.mimeType];
  if (!ext) throw ruleViolation("UNSUPPORTED_MEDIA_TYPE", "Allowed: png, jpeg, webp, gif");
  const filename = `${assetId}.${ext}`;
  if (!FILENAME_RE.test(filename)) throw notFound("Upload");
  let size: number;
  try {
    size = (await fs.stat(path.join(UPLOADS_DIR, filename))).size;
  } catch {
    throw ruleViolation("UPLOAD_MISSING", "Upload the file before confirming");
  }
  const asset = await prisma.mediaAsset.create({
    data: {
      id: assetId,
      uploaderId: actor.id,
      url: `/uploads/${filename}`,
      mimeType: b.mimeType,
      bytes: size,
      width: b.width,
      height: b.height,
      altText: b.altText,
      createdAt: now,
    },
  });
  await writeAudit(prisma, actor.id, "create", "media_asset", asset.id, null, { url: asset.url, bytes: size }, actor.ip, now);
  return {
    id: asset.id,
    url: asset.url,
    mimeType: asset.mimeType,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    createdAt: asset.createdAt.toISOString(),
  };
}

export const mediaQuery = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listMedia(q: z.infer<typeof mediaQuery>) {
  const rows = await prisma.mediaAsset.findMany({
    where: { ...(q.cursor ? { id: { lt: q.cursor } } : {}) },
    orderBy: { id: "desc" },
    take: q.limit + 1,
  });
  const { page, nextCursor } = pageOf(rows, q.limit);
  return {
    data: page.map((a) => ({
      id: a.id,
      url: a.url,
      mimeType: a.mimeType,
      bytes: a.bytes,
      width: a.width,
      height: a.height,
      altText: a.altText,
      createdAt: a.createdAt.toISOString(),
    })),
    nextCursor,
  };
}
