import { withApi, parseQuery } from "@/server/http";
import { feedbackQuery, listFeedback } from "@/server/services/adminOpsService";

// GET /admin/feedback?kind=&resolved=&cursor= - doc 03 §14.5.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const q = parseQuery(ctx, feedbackQuery);
  const { data, nextCursor } = await listFeedback(q);
  return { data, meta: { nextCursor } };
});
