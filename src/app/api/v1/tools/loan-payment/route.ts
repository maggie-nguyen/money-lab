import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/server/http";
import { loanPayment, loanPaymentBody, recordToolUse } from "@/server/services/toolsService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

// POST /tools/loan-payment - doc 03 §8.2 (schedule capped at 360 rows)
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, loanPaymentBody);
  const locale = parseQuery(ctx, q).locale ?? "vi";
  await recordToolUse(ctx.req, "loan-payment", ctx.now());
  return loanPayment(input, locale);
});
