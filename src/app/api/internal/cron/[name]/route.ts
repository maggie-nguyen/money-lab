import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/config";
import { jsonResponse } from "@/server/http";
import { logger } from "@/server/lib/logger";
import { isCronName, runCron, CRON_NAMES } from "@/server/services/cronService";

// GET/POST /api/internal/cron/{name} - doc 01 §8.
// Vercel Cron calls GET with `Authorization: Bearer <CRON_SECRET>`. POST with
// X-Cron-Secret remains available for manual runs and other schedulers.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env().CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleCron(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const provided = bearer ?? req.headers.get("x-cron-secret");
  if (!secretMatches(provided)) {
    return jsonResponse(
      { error: { code: "FORBIDDEN", message: "Invalid cron secret" } },
      403,
      { "cache-control": "no-store" },
    );
  }

  const { name } = await params;
  if (!isCronName(name)) {
    return jsonResponse(
      {
        error: {
          code: "NOT_FOUND",
          message: "Unknown cron job",
          details: { known: CRON_NAMES },
        },
      },
      404,
      { "cache-control": "no-store" },
    );
  }

  const startedAt = Date.now();
  let result;
  try {
    result = await runCron(name, new Date());
  } catch (e) {
    // A job that throws outright still answers the scheduler, for the same
    // reason a failed one does, but it is logged at error and never recorded
    // as a success.
    logger.error(
      {
        cron: name,
        durationMs: Date.now() - startedAt,
        err: e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e) },
      },
      "cron_run threw",
    );
    return jsonResponse(
      { data: { name, ok: false, durationMs: Date.now() - startedAt, note: "threw" } },
      200,
      { "cache-control": "no-store" },
    );
  }
  const durationMs = Date.now() - startedAt;

  // A failed job still answers 200: the scheduler's retry would double the work, and `ok:false`
  // plus the cron_run row is what alerting reads (doc 08 §7).
  logger[result.ok ? "info" : "error"](
    { cron: name, ok: result.ok, durationMs, note: result.note },
    "cron_run",
  );

  return jsonResponse(
    { data: { name, ok: result.ok, durationMs, note: result.note, details: result.details } },
    200,
    { "cache-control": "no-store" },
  );
}

export const GET = handleCron;
export const POST = handleCron;
