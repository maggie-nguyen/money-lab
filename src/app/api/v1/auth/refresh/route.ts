import { withApi, parseBody } from "@/server/http";
import { refreshSchema } from "@/server/schemas/auth";
import { refresh } from "@/server/services/authService";

export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, refreshSchema);
  return { data: await refresh(input, ctx.now) };
});
