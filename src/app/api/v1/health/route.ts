import { prisma } from "@/server/db";
import { jsonResponse } from "@/server/http";

// GET /health - doc 01 §10. No auth, no rate limit, never cached.
// degraded when the DB is unreachable or `daily-rollover` hasn't succeeded in 26 h (doc 08 §7).

const CRON_STALE_MS = 26 * 3600 * 1000;

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let db: "ok" | "down" = "ok";
  let cron: "ok" | "stale" = "stale";

  try {
    const last = await prisma.cronRun.findFirst({
      where: { name: "daily-rollover", ok: true },
      orderBy: { ranAt: "desc" },
      select: { ranAt: true },
    });
    cron = last && Date.now() - last.ranAt.getTime() < CRON_STALE_MS ? "ok" : "stale";
  } catch {
    db = "down";
  }

  const status = db === "ok" && cron === "ok" ? "ok" : "degraded";
  return jsonResponse(
    { data: { status, db, cron, version: process.env.GIT_SHA ?? "dev" } },
    db === "ok" ? 200 : 503,
    { "cache-control": "no-store" },
  );
}
