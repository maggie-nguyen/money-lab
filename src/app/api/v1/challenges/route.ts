import { z } from "zod";
import { withApi, parseQuery } from "@/server/http";
import { listChallenges } from "@/server/services/challengeService";

const q = z.object({ locale: z.literal("vi").default("vi") });

export const GET = withApi({ auth: "optional", rateLimit: "read" }, async (ctx) => {
  const locale = parseQuery(ctx, q).locale ?? "vi";
  return { data: await listChallenges(locale) };
});
