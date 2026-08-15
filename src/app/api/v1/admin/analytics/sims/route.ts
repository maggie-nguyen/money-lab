import { withApi } from "@/server/http";
import { simAnalytics } from "@/server/services/adminAnalyticsService";

// GET /admin/analytics/sims - doc 03 §14.6.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async () => {
  return { data: await simAnalytics() };
});
