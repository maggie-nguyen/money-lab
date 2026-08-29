import { prisma } from "@/server/db";
import { jsonResponse } from "@/server/http";

// GET /health - doc 01 §10. No auth, no rate limit, never cached.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let db: "ok" | "down" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }

  const status = db === "ok" ? "ok" : "degraded";
  return jsonResponse(
    { data: { status, db, version: process.env.GIT_SHA ?? "dev" } },
    db === "ok" ? 200 : 503,
    { "cache-control": "no-store" },
  );
}
