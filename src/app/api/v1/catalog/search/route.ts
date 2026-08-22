import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { search } from "@/server/services/catalogService";

const q = z.object({
  q: z.string().trim().min(2).max(100),
  locale: z.literal("vi").default("vi"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => {
  const query = parseQuery(ctx, q);
  return { data: await search(query.q, query.locale ?? "vi", query.limit ?? 20) };
});
