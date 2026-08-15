import { withApi } from "@/server/http";
import { getSurvey } from "@/server/services/feedbackService";

// GET /surveys/:slug - doc 03 §10.3 (404 when closed)
export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => ({
  data: await getSurvey(ctx.params.slug!, ctx.now()),
}));
