import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { articleListQuery, listArticles } from "@/server/services/libraryService";

const q = articleListQuery.extend({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => {
  const query = parseQuery(ctx, q);
  const { data, nextCursor } = await listArticles(query, query.locale ?? "vi");
  return { data, meta: { nextCursor } };
});
