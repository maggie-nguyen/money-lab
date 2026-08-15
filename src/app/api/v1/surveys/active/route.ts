import { withApi } from "@/server/http";
import { activeSurvey } from "@/server/services/feedbackService";

// GET /surveys/active - doc 03 §10.2 (null when nothing matches)
export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => ({
  data: await activeSurvey(ctx.user?.id ?? null, ctx.now()),
}));
