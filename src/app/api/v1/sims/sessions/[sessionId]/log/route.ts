import { withApi } from "@/server/http";
import { getLog } from "@/server/services/simService";

// GET - full action log (owner or ADMIN); powers the post-game review screen.
export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await getLog(ctx.user!.id, ctx.user!.role, ctx.params.sessionId!),
}));
