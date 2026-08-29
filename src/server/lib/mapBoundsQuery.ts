import { z } from "zod";
import { MAP_SPOT_FETCH_BOUNDS } from "@/lib/map";

/** Max bbox span — allows Vietnam-wide fetch (see MAP_SPOT_FETCH_BOUNDS). */
const MAX_LAT_SPAN =
  Math.abs(MAP_SPOT_FETCH_BOUNDS.neLat - MAP_SPOT_FETCH_BOUNDS.swLat) + 1;
const MAX_LNG_SPAN =
  Math.abs(MAP_SPOT_FETCH_BOUNDS.neLng - MAP_SPOT_FETCH_BOUNDS.swLng) + 1;

export const mapBoundsQuerySchema = z
  .object({
    swLat: z.coerce.number().min(-90).max(90),
    swLng: z.coerce.number().min(-180).max(180),
    neLat: z.coerce.number().min(-90).max(90),
    neLng: z.coerce.number().min(-180).max(180),
  })
  .superRefine((value, ctx) => {
    if (
      Math.abs(value.neLat - value.swLat) > MAX_LAT_SPAN ||
      Math.abs(value.neLng - value.swLng) > MAX_LNG_SPAN
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Map area is too large", path: [] });
    }
  });
