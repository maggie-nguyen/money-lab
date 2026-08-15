import { withApi, parseBody } from "@/server/http";
import { googleSchema } from "@/server/schemas/auth";
import { googleLogin } from "@/server/services/authService";

export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, googleSchema);
  const result = await googleLogin(input, ctx.now, {
    userAgent: ctx.req.headers.get("user-agent") ?? undefined,
    ip: ctx.ip,
  });
  return { data: result };
});
