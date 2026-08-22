import { withApi, parseBody } from "@/server/http";
import { budget503020Body, budgetSplit, recordToolUse } from "@/server/services/toolsService";

// POST /tools/budget-503020 - doc 03 §8.6
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, budget503020Body);
  await recordToolUse(ctx.req, "budget-503020", ctx.now());
  return budgetSplit(input);
});
