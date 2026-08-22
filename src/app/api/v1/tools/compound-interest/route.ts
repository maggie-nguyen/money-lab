import { withApi, parseBody } from "@/server/http";
import { compoundInterest, compoundInterestBody, recordToolUse } from "@/server/services/toolsService";

// POST /tools/compound-interest - doc 03 §8.1
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, compoundInterestBody);
  await recordToolUse(ctx.req, "compound-interest", ctx.now());
  return compoundInterest(input);
});
