import { withApi, parseBody } from "@/server/http";
import { googleSchema } from "@/server/schemas/auth";
import { googleLogin } from "@/server/services/authService";
import { sessionCookieHeaders, withCookies } from "@/server/sessionCookies";

// Browser Google sign-in: same service as /api/v1/auth/google, but the tokens
// land in httpOnly cookies instead of the response body. One route covers both
// sign-in and sign-up, since Google either matches a verified email or creates
// the account, and the browser cannot tell which ahead of time.
export const POST = withApi({ auth: "none", rateLimit: "auth" }, async (ctx) => {
  const input = await parseBody(ctx, googleSchema);
  const result = await googleLogin(input, ctx.now, {
    userAgent: ctx.req.headers.get("user-agent") ?? undefined,
    ip: ctx.ip,
  });
  // isNewUser travels back so the page can send a fresh account to /welcome
  // and a returning one straight to the wallet hub.
  return withCookies(
    { data: { user: result.user, isNewUser: result.isNewUser } },
    200,
    sessionCookieHeaders(result),
  );
});
