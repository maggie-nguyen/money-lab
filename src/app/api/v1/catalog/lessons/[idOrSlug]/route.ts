import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { getLesson } from "@/server/services/catalogService";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => ({
  data: await getLesson(
    ctx.params.idOrSlug!,
    parseQuery(ctx, q).locale ?? "vi",
    ctx.user?.id ?? null,
  ),
}));
