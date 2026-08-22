import { withApi, parseBody } from "@/server/http";
import { loanPayment, loanPaymentBody, recordToolUse } from "@/server/services/toolsService";

// POST /tools/loan-payment - doc 03 §8.2
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, loanPaymentBody);
  await recordToolUse(ctx.req, "loan-payment", ctx.now());
  return loanPayment(input);
});
