import { withApi, parseBody } from "@/server/http";
import { recordToolUse, savingsGoal, savingsGoalBody } from "@/server/services/toolsService";

// POST /tools/savings-goal - doc 03 §8.4 (422 UNREACHABLE)
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, savingsGoalBody);
  await recordToolUse(ctx.req, "savings-goal", ctx.now());
  return savingsGoal(input, ctx.now());
});
