import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/server/http";
import { recordToolUse, savingsGoal, savingsGoalBody } from "@/server/services/toolsService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

// POST /tools/savings-goal - doc 03 §8.4 (422 UNREACHABLE)
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, savingsGoalBody);
  const locale = parseQuery(ctx, q).locale ?? "vi";
  await recordToolUse(ctx.req, "savings-goal", ctx.now());
  return savingsGoal(input, ctx.now(), locale);
});
