import { withApi } from "@/server/http";
import { submitAttempt } from "@/server/services/quizService";

// POST - score + finalize the attempt. Idempotency-Key supported.
export const POST = withApi(
  { auth: "required", rateLimit: "write", idempotent: true },
  async (ctx) => ({
    data: await submitAttempt(ctx.user!.id, ctx.params.id!, ctx.params.attemptId!, ctx.now),
  }),
);
