import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { exportBundles } from "@/server/services/contentExport";

// GET /admin/export?scope=all|track:{slug}|course:{slug} - doc 03 §14.2.

const exportQueryS = z.object({ scope: z.string().min(1).max(120).default("all") });

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const q = parseQuery(ctx, exportQueryS);
  return { data: await exportBundles(q.scope) };
});
