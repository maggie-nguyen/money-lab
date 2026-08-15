import { withApi } from "@/server/http";
import { startLesson } from "@/server/services/progressService";

// POST /lessons/:id/start - auto-enrolls; idempotent
export const POST = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => ({
  data: await startLesson(ctx.user!.id, ctx.params.id!, ctx.now),
}));
