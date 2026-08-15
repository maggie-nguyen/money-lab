import { withApi } from "@/server/http";
import { questsToday } from "@/server/services/gamificationQueryService";

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await questsToday(ctx.user!.id, ctx.now),
}));
