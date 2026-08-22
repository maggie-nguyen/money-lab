import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { getAttempt } from "@/server/services/quizService";

const q = z.object({ locale: z.literal("vi").default("vi") });

// GET /quizzes/:id/attempts/:attemptId - owner-only (404 otherwise)
export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => ({
  data: await getAttempt(
    ctx.user!.id,
    ctx.params.id!,
    ctx.params.attemptId!,
    ctx.now,
    parseQuery(ctx, q).locale ?? "vi",
  ),
}));
