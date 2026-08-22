import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listFoodSpots } from "@/server/services/foodMapService";
import { AppError } from "@/server/lib/errors";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => {
  const locale = parseQuery(ctx, q).locale ?? "vi";
  const result = await listFoodSpots(ctx.params.slug!, locale);
  if (!result) throw new AppError("NOT_FOUND", "Cluster not found");
  return { data: result };
});
