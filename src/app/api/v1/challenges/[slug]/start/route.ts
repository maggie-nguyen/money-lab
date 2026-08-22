import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listUserChallenges, startChallenge } from "@/server/services/challengeService";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => {
  const locale = parseQuery(ctx, q).locale ?? "vi";
  return { data: await listUserChallenges(ctx.user!.id, locale) };
});

export const POST = withApi({ auth: "required", rateLimit: "write" }, async (ctx) => {
  const participation = await startChallenge(ctx.user!.id, ctx.params.slug!, ctx.now());
  return { data: participation, status: 201 };
});
