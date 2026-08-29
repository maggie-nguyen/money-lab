import { withApi, parseQuery } from "@/server/http";
import { mapBoundsQuerySchema } from "@/server/lib/mapBoundsQuery";
import { listSchoolsInBounds } from "@/server/services/foodMapService";

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => {
  const bounds = parseQuery(ctx, mapBoundsQuerySchema);
  const data = await listSchoolsInBounds(bounds);
  return { data };
});
