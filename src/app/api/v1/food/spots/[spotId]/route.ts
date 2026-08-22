import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/server/http";
import { createFoodReview, foodReviewBodySchema, getFoodSpot } from "@/server/services/foodMapService";
import { AppError } from "@/server/lib/errors";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => {
  const locale = parseQuery(ctx, q).locale ?? "vi";
  const spot = await getFoodSpot(ctx.params.spotId!, locale);
  if (!spot) throw new AppError("NOT_FOUND", "Spot not found");
  return { data: spot };
});

export const POST = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => {
  const spotId = ctx.params.spotId;
  if (!spotId) throw new AppError("NOT_FOUND", "Spot not found");
  const input = await parseBody(ctx, foodReviewBodySchema);
  try {
    const review = await createFoodReview(ctx.user!.id, spotId, input);
    return { data: review, status: 201 };
  } catch {
    throw new AppError("NOT_FOUND", "Spot not found");
  }
});
