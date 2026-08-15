import { withApi } from "@/server/http";
import { getStats } from "@/server/services/meService";

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await getStats(ctx.user!.id),
}));
