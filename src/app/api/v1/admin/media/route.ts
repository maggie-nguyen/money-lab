import { withApi, parseQuery } from "@/server/http";
import { listMedia, mediaQuery } from "@/server/services/adminOpsService";

// GET /admin/media - doc 03 §14.3.

export const GET = withApi({ auth: "required", roles: ["ADMIN"], rateLimit: "read" }, async (ctx) => {
  const q = parseQuery(ctx, mediaQuery);
  const { data, nextCursor } = await listMedia(q);
  return { data, meta: { nextCursor } };
});
