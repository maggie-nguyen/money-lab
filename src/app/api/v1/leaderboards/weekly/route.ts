import { withApi } from "@/server/http";
import { weeklyLeaderboard } from "@/server/services/gamificationQueryService";

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await weeklyLeaderboard(ctx.user!.id, ctx.now),
}));
