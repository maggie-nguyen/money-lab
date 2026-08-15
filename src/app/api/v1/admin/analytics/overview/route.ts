import { withApi, parseQuery } from "@/server/http";
import { analyticsOverview, overviewQuery } from "@/server/services/adminAnalyticsService";

// GET /admin/analytics/overview?from=&to= - doc 03 §14.6.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const q = parseQuery(ctx, overviewQuery);
  return { data: await analyticsOverview(q, ctx.now()) };
});
