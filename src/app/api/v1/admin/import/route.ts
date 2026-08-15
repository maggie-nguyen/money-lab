import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { readJsonBody, writeAudit } from "@/server/services/adminCommon";
import { importBundle } from "@/server/services/contentImport";
import { prisma } from "@/server/db";

// POST /admin/import[?apply=true] - doc 03 §14.2. Default is a dry-run report;
// apply=true performs the upsert transactionally (all-or-nothing inside importBundle).

const importQuery = z.object({ apply: z.enum(["true", "false"]).default("false") });

export const POST = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "write" }, async (ctx) => {
  const q = parseQuery(ctx, importQuery);
  const raw = await readJsonBody(ctx);
  const apply = q.apply === "true";
  const report = await importBundle(raw, !apply);
  if (apply && report.ok) {
    await writeAudit(
      prisma, ctx.user!.id, "import", "bundle",
      (raw as { course?: { slug?: string } })?.course?.slug ?? "unknown",
      null, { summary: report.summary }, ctx.ip, ctx.now(),
    );
  }
  return { data: report, status: report.ok ? 200 : 422 };
});
