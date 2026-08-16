import { z } from "zod";
import { withApi, parseBody, parseQuery } from "@/server/http";
import { budget503020Body, budgetSplit, recordToolUse } from "@/server/services/toolsService";

const q = z.object({ locale: z.enum(["vi", "en"]).default("vi") });

// POST /tools/budget-503020 - doc 03 §8.6
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, budget503020Body);
  const locale = parseQuery(ctx, q).locale ?? "vi";
  await recordToolUse(ctx.req, "budget-503020", ctx.now());
  return budgetSplit(input, locale);
});
