import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listSchoolsInBounds } from "@/server/services/foodMapService";

const q = z
  .object({
    swLat: z.coerce.number().min(-90).max(90),
    swLng: z.coerce.number().min(-180).max(180),
    neLat: z.coerce.number().min(-90).max(90),
    neLng: z.coerce.number().min(-180).max(180),
  })
  .superRefine((value, ctx) => {
    if (Math.abs(value.neLat - value.swLat) > 3 || Math.abs(value.neLng - value.swLng) > 4) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Map area is too large", path: [] });
    }
  });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => {
  const bounds = parseQuery(ctx, q);
  const data = await listSchoolsInBounds(bounds);
  return { data };
});
