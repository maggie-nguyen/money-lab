import { withApi, parseBody } from "@/server/http";
import { submitSurveyResponse, surveyResponseBody } from "@/server/services/feedbackService";

// POST /surveys/:slug/responses - doc 03 §10.4 (409 already responded, 410 closed)
export const POST = withApi(
  { auth: "optional", rateLimit: "write", idempotent: true },
  async (ctx) => ({
    data: await submitSurveyResponse(
      ctx.user?.id ?? null,
      ctx.params.slug!,
      await parseBody(ctx, surveyResponseBody),
      ctx.now(),
    ),
    status: 201,
  }),
);
