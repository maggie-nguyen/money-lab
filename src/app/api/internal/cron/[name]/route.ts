import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/config";
import { jsonResponse } from "@/server/http";
import { logger } from "@/server/lib/logger";
import { isCronName, runCron, CRON_NAMES } from "@/server/services/cronService";

// POST /api/internal/cron/{name} - doc 01 §8.
// Not a public API: no user auth, no rate limit. The scheduler proves itself with X-Cron-Secret.
// Anything else gets 403 (never 401 - this route does not participate in the token scheme).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env().CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  if (!secretMatches(req.headers.get("x-cron-secret"))) {
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
