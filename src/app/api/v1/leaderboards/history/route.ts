import { withApi } from "@/server/http";
import { leaderboardHistory } from "@/server/services/gamificationQueryService";

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await leaderboardHistory(ctx.user!.id),
}));
