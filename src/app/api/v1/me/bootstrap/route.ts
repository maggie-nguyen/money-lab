import { withApi } from "@/server/http";
import { getBootstrap } from "@/server/services/meService";

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await getBootstrap(ctx.user!.id, ctx.now),
}));
