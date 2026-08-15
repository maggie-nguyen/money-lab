import { z } from "zod";
import { withApi, parseQuery, paginationSchema } from "@/server/http";
import { getLedger } from "@/server/services/meService";

const querySchema = paginationSchema.extend({ type: z.enum(["xp", "coin"]).default("xp") });

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => {
  const q = parseQuery(ctx, querySchema);
  const result = await getLedger(ctx.user!.id, q.type ?? "xp", q.limit ?? 20, q.cursor);
  return { data: result.data, meta: result.meta };
});
