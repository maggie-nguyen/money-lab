import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z, ZodSchema } from "zod";
import { prisma } from "@/server/db";
import { env } from "@/server/config";
import { AppError, ErrorDetail, unauthenticated, forbidden } from "@/server/lib/errors";
import { uuidv7 } from "@/server/lib/ids";
import { logger } from "@/server/lib/logger";
import { bigintReplacer } from "@/server/lib/money";
import { verifyAccessToken } from "@/server/auth/jwt";
import { systemClock, type Clock } from "@/server/lib/time";

// Request lifecycle wrapper - doc 01 §4. Order: requestId → CORS/origin → rate limit →
// authN → authZ → idempotency → Zod → service → serialize.

export type BucketName = "auth" | "write" | "sim-action" | "tutor" | "events" | "read";

const BUCKETS: Record<BucketName, { limit: number; windowSec: number; byIp?: boolean }> = {
  auth: { limit: 10, windowSec: 600, byIp: true },
  write: { limit: 120, windowSec: 60 },
  "sim-action": { limit: 30, windowSec: 60 },
  tutor: { limit: 10, windowSec: 60 },
  events: { limit: 60, windowSec: 60 },
  read: { limit: 600, windowSec: 60 },
};

export interface AuthedUser {
  id: string;
  role: "LEARNER" | "ADMIN";
}

export interface ApiCtx {
  req: NextRequest;
  requestId: string;
  user: AuthedUser | null;
  now: Clock;
  params: Record<string, string>;
  ip: string;
}

type Handler = (ctx: ApiCtx) => Promise<Response | { data: unknown; meta?: unknown; status?: number }>;

interface ApiOptions {
  auth: "required" | "optional" | "none";
  roles?: Array<"LEARNER" | "ADMIN">;
  rateLimit?: BucketName;
  idempotent?: boolean;
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body, bigintReplacer), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId: string,
  details?: ErrorDetail[],
  headers?: Record<string, string>,
): Response {
  return jsonResponse(
    { error: { code, message, ...(details ? { details } : {}), requestId } },
    status,
    { "x-request-id": requestId, ...headers },
  );
}

async function checkRateLimit(
  bucket: BucketName,
  subjectKey: string,
  now: Date,
): Promise<number | null> {
  if (env().RATE_LIMIT_DISABLED) return null;
  const cfg = BUCKETS[bucket];
  const windowStart = new Date(Math.floor(now.getTime() / (cfg.windowSec * 1000)) * cfg.windowSec * 1000);
  const row = await prisma.rateLimit.upsert({
    where: { bucket_subjectKey_windowStart: { bucket, subjectKey, windowStart } },
    create: { bucket, subjectKey, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count > cfg.limit) {
    const retryAfter = Math.ceil(
      (windowStart.getTime() + cfg.windowSec * 1000 - now.getTime()) / 1000,
    );
    return Math.max(1, retryAfter);
  }
  return null;
}

/**
 * The address the rate limiter buckets by.
 *
 * x-forwarded-for is a list a client can prefill, so the leftmost entry is
 * whatever the caller felt like writing. The rightmost entry is the one the
 * proxy in front of us appended from the socket it actually accepted, so that
 * is the one we read, and a spoofed prefix is ignored.
 *
 * This assumes exactly one trusted proxy in front of the app, which is the
 * deployment doc 09 describes. Adding a second one without stripping the
 * inbound header would let a caller push a forged entry into that position.
 */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

function sameOriginOk(req: NextRequest): boolean {
  // JSON-only API + SameSite cookie is the main CSRF control; belt-and-braces origin check
  // for state-changing requests that carry an Origin header.
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients
  try {
    return new URL(origin).origin === new URL(env().APP_ORIGIN).origin;
  } catch {
    return false;
  }
}

export function withApi(opts: ApiOptions, handler: Handler) {
  return async (
    req: NextRequest,
    // Next 15 validates route exports against RouteContext, so this argument is
    // declared required even though non-dynamic routes carry no params.
    routeCtx: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const requestId = `req_${uuidv7()}`;
    const now = systemClock;
    const ip = clientIp(req);
    // Declared outside the try so the error log can name the caller.
    let user: AuthedUser | null = null;
    try {
      if (!sameOriginOk(req)) {
        return errorResponse("FORBIDDEN", "Cross-origin request rejected", 403, requestId);
      }

      // AuthN
      const bearer = req.headers.get("authorization");
      const cookieToken = req.cookies.get("ml_access")?.value;
      const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : cookieToken;
      if (token) {
        const claims = await verifyAccessToken(token);
        if (claims) user = { id: claims.sub, role: claims.role };
      }
      if (opts.auth === "required" && !user) throw unauthenticated();
      if (user && opts.roles && !opts.roles.includes(user.role)) throw forbidden();

      // Rate limit (userId if authed, else IP; auth bucket always by IP)
      if (opts.rateLimit) {
        const cfg = BUCKETS[opts.rateLimit];
        const subject = cfg.byIp || !user ? `ip:${ip}` : `u:${user.id}`;
        const retryAfter = await checkRateLimit(opts.rateLimit, subject, now());
        if (retryAfter !== null) {
          return errorResponse("RATE_LIMITED", "Too many requests", 429, requestId, undefined, {
            "retry-after": String(retryAfter),
          });
        }
      }

      // Idempotency replay (doc 01 §3.5)
      let idemKey: string | null = null;
      let requestHash: string | null = null;
      let rawBody: string | null = null;
      if (opts.idempotent && user) {
        idemKey = req.headers.get("idempotency-key");
        if (idemKey) {
          rawBody = await req.text();
          requestHash = createHash("sha256").update(`${req.method} ${req.nextUrl.pathname}\n${rawBody}`).digest("hex");
          const existing = await prisma.idempotencyKey.findUnique({
            where: { userId_key: { userId: user.id, key: idemKey } },
          });
          if (existing) {
            if (existing.requestHash !== requestHash) {
              return errorResponse(
                "CONFLICT",
                "Idempotency key reused with a different request",
                409,
                requestId,
              );
            }
            return jsonResponse(existing.responseBody, existing.responseStatus, {
              "x-request-id": requestId,
              "idempotent-replay": "true",
            });
          }
        }
      }

      const params = routeCtx?.params ? await routeCtx.params : {};
      const ctx: ApiCtx = { req: patchedReq(req, rawBody), requestId, user, now, params, ip };
      const result = await handler(ctx);

      let response: Response;
      let bodyForStore: unknown = null;
      let statusForStore = 200;
      if (result instanceof Response) {
        response = result;
      } else {
        const status = result.status ?? 200;
        if (status === 204) {
          // 204 must carry no body (RFC 9110); handlers signal it with { data: null, status: 204 }.
          response = new Response(null, { status: 204, headers: { "x-request-id": requestId } });
          return response;
        }
        const body = { data: result.data, ...(result.meta !== undefined ? { meta: result.meta } : {}) };
        bodyForStore = JSON.parse(JSON.stringify(body, bigintReplacer));
        statusForStore = status;
        response = jsonResponse(body, status, { "x-request-id": requestId });
      }

      if (idemKey && user && requestHash && bodyForStore !== null) {
        await prisma.idempotencyKey
          .create({
            data: {
              id: uuidv7(),
              userId: user.id,
              key: idemKey,
              endpoint: req.nextUrl.pathname,
              requestHash,
              responseStatus: statusForStore,
              responseBody: bodyForStore as object,
            },
          })
          .catch(() => undefined); // concurrent duplicate - replay path already covered
      }
      return response;
    } catch (e) {
      if (e instanceof AppError) {
        return errorResponse(
          e.code,
          e.message,
          e.httpStatus,
          requestId,
          e.details,
          e.retryAfterSec ? { "retry-after": String(e.retryAfterSec) } : undefined,
        );
      }
      logger.error(
        {
          requestId,
          method: req.method,
          path: req.nextUrl.pathname,
          userId: user?.id,
          err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) },
        },
        "unhandled request error",
      );
      return errorResponse("INTERNAL", "Internal server error", 500, requestId);
    }
  };
}

/** Re-attach a body that was consumed for idempotency hashing. */
function patchedReq(req: NextRequest, rawBody: string | null): NextRequest {
  if (rawBody === null) return req;
  const patched = req as NextRequest & { _mlRawBody?: string };
  patched._mlRawBody = rawBody;
  return patched;
}

/** Parse and validate a JSON body with Zod → 400 VALIDATION_ERROR with details. */
export async function parseBody<S extends ZodSchema>(ctx: ApiCtx, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  const cached = (ctx.req as NextRequest & { _mlRawBody?: string })._mlRawBody;
  try {
    raw = cached !== undefined ? JSON.parse(cached || "{}") : await ctx.req.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Request validation failed", {
      details: parsed.error.issues.map((i) => ({
        path: `body.${i.path.join(".")}`,
        message: i.message,
      })),
    });
  }
  return parsed.data;
}

export function parseQuery<S extends ZodSchema>(ctx: ApiCtx, schema: S): z.output<S> {
  const obj: Record<string, string> = {};
  ctx.req.nextUrl.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Query validation failed", {
      details: parsed.error.issues.map((i) => ({
        path: `query.${i.path.join(".")}`,
        message: i.message,
      })),
    });
  }
  return parsed.data;
}

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});
