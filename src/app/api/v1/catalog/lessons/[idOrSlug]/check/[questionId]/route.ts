import { z } from "zod";
import { withApi, parseBody } from "@/server/http";
import { checkLessonQuestion } from "@/server/services/checkQuestionService";

// POST /catalog/lessons/:idOrSlug/check/:questionId
// Formative check inside a lesson. Nothing is stored and no XP is granted, so
// it is rate limited as a read rather than a write.
const body = z.object({ response: z.record(z.unknown()) });

export const POST = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => ({
  data: await checkLessonQuestion(
    ctx.params.idOrSlug!,
    ctx.params.questionId!,
    (await parseBody(ctx, body)).response,
  ),
}));
