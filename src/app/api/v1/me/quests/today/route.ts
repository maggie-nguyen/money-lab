import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { questsToday } from "@/server/services/gamificationQueryService";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await questsToday(ctx.user!.id, ctx.now, parseQuery(ctx, q).locale ?? "vi"),
}));
