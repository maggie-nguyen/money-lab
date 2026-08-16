import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/server/http";
import { compoundInterest, compoundInterestBody, recordToolUse } from "@/server/services/toolsService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

// POST /tools/compound-interest - doc 03 §8.1
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, compoundInterestBody);
  const locale = parseQuery(ctx, q).locale ?? "vi";
  await recordToolUse(ctx.req, "compound-interest", ctx.now());
  return compoundInterest(input, locale);
});
