import { withApi, parseBody } from "@/server/http";
import { loginSchema } from "@/server/schemas/auth";
import { login } from "@/server/services/authService";

export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, loginSchema);
  const result = await login(input, ctx.now, {
    userAgent: ctx.req.headers.get("user-agent") ?? undefined,
    ip: ctx.ip,
  });
  return { data: result };
});
