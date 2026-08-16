import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/server/http";
import { loanCompare, loanCompareBody, recordToolUse } from "@/server/services/toolsService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

// POST /tools/loan-compare - doc 03 §8.3 (2..4 loans)
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, loanCompareBody);
  const locale = parseQuery(ctx, q).locale ?? "vi";
  await recordToolUse(ctx.req, "loan-compare", ctx.now());
  return loanCompare(input, locale);
});
