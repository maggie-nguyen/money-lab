import { withApi, parseBody } from "@/server/http";
import { createFeedback, feedbackBody } from "@/server/services/feedbackService";

// POST /feedback - doc 03 §10.1 (auth optional; bodies are never logged, doc 01 §9.6)
export const POST = withApi({ auth: "optional", rateLimit: "write" }, async (ctx) => ({
  data: await createFeedback(ctx.user?.id ?? null, await parseBody(ctx, feedbackBody), ctx.now()),
  status: 201,
}));
