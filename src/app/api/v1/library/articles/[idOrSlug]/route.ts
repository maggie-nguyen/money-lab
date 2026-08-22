import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { getArticle } from "@/server/services/libraryService";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => ({
  data: await getArticle(ctx.params.idOrSlug!, parseQuery(ctx, q).locale ?? "vi"),
}));
