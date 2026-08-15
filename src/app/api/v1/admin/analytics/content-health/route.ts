import { withApi, parseQuery } from "@/server/http";
import { contentHealth, contentHealthQuery } from "@/server/services/adminAnalyticsService";

// GET /admin/analytics/content-health?courseId= - doc 03 §14.6.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const q = parseQuery(ctx, contentHealthQuery);
  return { data: await contentHealth(q) };
});
