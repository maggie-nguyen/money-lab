import { withApi } from "@/server/http";
import { abandonSession } from "@/server/services/simService";

export const POST = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => ({
  data: await abandonSession(ctx.user!.id, ctx.params.sessionId!),
}));
