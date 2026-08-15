import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listHistory } from "@/server/services/simService";

const q = z.object({
  simId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => {
  const query = parseQuery(ctx, q);
  return {
    data: await listHistory(ctx.user!.id, query.simId, query.cursor, query.limit ?? 20),
  };
});
