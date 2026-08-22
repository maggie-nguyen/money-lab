import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listFoodSpotsInBounds } from "@/server/services/foodMapService";

const q = z.object({
  swLat: z.coerce.number().min(-90).max(90),
  swLng: z.coerce.number().min(-180).max(180),
  neLat: z.coerce.number().min(-90).max(90),
  neLng: z.coerce.number().min(-180).max(180),
});

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => {
  const bounds = parseQuery(ctx, q);
  const data = await listFoodSpotsInBounds(bounds);
  return { data };
});
