import { withApi, parseBody } from "@/server/http";
import { signupSchema } from "@/server/schemas/auth";
import { signup } from "@/server/services/authService";
import { sessionCookieHeaders, withCookies } from "@/server/sessionCookies";

export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, signupSchema);
  const result = await signup(input, ctx.now, {
    userAgent: ctx.req.headers.get("user-agent") ?? undefined,
    ip: ctx.ip,
  });
  return withCookies({ data: { user: result.user } }, 201, sessionCookieHeaders(result));
});
