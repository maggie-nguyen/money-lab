import { withApi } from "@/server/http";
import { completeLesson } from "@/server/services/progressService";

// POST /lessons/:id/complete - requires passed check quiz; awards once; may
// complete the course and issue a certificate. Idempotency-Key supported.
export const POST = withApi(
  { auth: "required", rateLimit: "write", idempotent: true },
  async (ctx) => ({ data: await completeLesson(ctx.user!.id, ctx.params.id!, ctx.now) }),
);
