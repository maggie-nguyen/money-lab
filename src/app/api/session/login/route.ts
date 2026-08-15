import { withApi, parseBody } from "@/server/http";
import { loginSchema } from "@/server/schemas/auth";
import { login } from "@/server/services/authService";
import { sessionCookieHeaders, withCookies } from "@/server/sessionCookies";

// Browser login: same service as /api/v1/auth/login, but the tokens land in
// httpOnly cookies instead of the response body.
export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, loginSchema);
  const result = await login(input, ctx.now, {
    userAgent: ctx.req.headers.get("user-agent") ?? undefined,
    ip: ctx.ip,
  });
  return withCookies({ data: { user: result.user } }, 200, sessionCookieHeaders(result));
});
