import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/config";
import { jsonResponse } from "@/server/http";
import { logger } from "@/server/lib/logger";
import { isCronName, runCron, CRON_NAMES } from "@/server/services/cronService";

// Optional manual maintenance endpoint. It remains disabled unless an operator
// explicitly configures CRON_SECRET and calls POST with X-Cron-Secret.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secretMatches(provided: string | null): boolean {
  const configured = env().CRON_SECRET;
  if (!provided || !configured) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleCron(
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

export const POST = handleCron;
