import { z } from "zod";
import { withApi, parseBody } from "@/server/http";
import { saveAnswer } from "@/server/services/quizService";

const body = z.object({ response: z.unknown() });

// PUT - upsert an answer while the attempt is IN_PROGRESS
export const PUT = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => {
  const input = await parseBody(ctx, body);
  return {
    data: await saveAnswer(
      ctx.user!.id,
      ctx.params.id!,
      ctx.params.attemptId!,
      ctx.params.questionId!,
      input.response,
      ctx.now,
    ),
  };
});
