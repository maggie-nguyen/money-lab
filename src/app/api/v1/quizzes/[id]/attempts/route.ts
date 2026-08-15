import { withApi } from "@/server/http";
import { startAttempt, listMyAttempts } from "@/server/services/quizService";

// POST /quizzes/:id/attempts - start attempt (409 with attemptId if one is in progress)
export const POST = withApi(
  { auth: "required", rateLimit: "write" },
  async (ctx) => ({ data: await startAttempt(ctx.user!.id, ctx.params.id!, ctx.now), status: 201 }),
);

// GET /quizzes/:id/attempts - my attempt history
export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await listMyAttempts(ctx.user!.id, ctx.params.id!),
}));
