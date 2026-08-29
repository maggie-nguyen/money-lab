import { withApi, parseQuery, parseBody } from "@/server/http";
import { mapBoundsQuerySchema } from "@/server/lib/mapBoundsQuery";
import {
  communityFoodSpotBodySchema,
  createCommunityFoodSpot,
  listFoodSpotsInBounds,
} from "@/server/services/foodMapService";

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => {
  const bounds = parseQuery(ctx, mapBoundsQuerySchema);
  const data = await listFoodSpotsInBounds(bounds);
  return { data };
});

export const POST = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => {
  const input = await parseBody(ctx, communityFoodSpotBodySchema);
  const data = await createCommunityFoodSpot(ctx.user!.id, input);
  return { data };
});
