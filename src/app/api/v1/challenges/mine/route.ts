import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listUserChallenges } from "@/server/services/challengeService";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "required", rateLimit: "read" }, async (ctx) => {
  const locale = parseQuery(ctx, q).locale ?? "vi";
  return { data: await listUserChallenges(ctx.user!.id, locale) };
});
