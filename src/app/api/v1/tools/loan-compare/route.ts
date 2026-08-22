import { withApi, parseBody } from "@/server/http";
import { loanCompare, loanCompareBody, recordToolUse } from "@/server/services/toolsService";

// POST /tools/loan-compare - doc 03 §8.3
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, loanCompareBody);
  await recordToolUse(ctx.req, "loan-compare", ctx.now());
  return loanCompare(input);
});
