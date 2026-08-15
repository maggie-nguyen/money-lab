import { withApi, parseBody } from "@/server/http";
import { inflation, inflationBody, recordToolUse } from "@/server/services/toolsService";

// POST /tools/inflation - doc 03 §8.5
export const POST = withApi({ auth: "none", rateLimit: "read" }, async (ctx) => {
  const input = await parseBody(ctx, inflationBody);
  await recordToolUse(ctx.req, "inflation", ctx.now());
  return inflation(input);
});
