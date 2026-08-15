import { withApi, parseQuery } from "@/server/http";
import { funnel, funnelQuery } from "@/server/services/adminAnalyticsService";

// GET /admin/analytics/funnel?steps=a,b,c&from=&to= - doc 03 §14.6.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const q = parseQuery(ctx, funnelQuery);
  return { data: await funnel(q, ctx.now()) };
});
