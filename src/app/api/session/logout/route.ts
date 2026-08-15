import { withApi } from "@/server/http";
import { logout } from "@/server/services/authService";
import { REFRESH_COOKIE, clearSessionCookieHeaders, withCookies } from "@/server/sessionCookies";

export const POST = withApi({ auth: "optional", rateLimit: "write" }, async (ctx) => {
  const token = ctx.req.cookies.get(REFRESH_COOKIE)?.value;
  if (ctx.user && token) {
    await logout(ctx.user.id, { refreshToken: token }, ctx.now);
  }
  // Cookies are cleared even when the token was already dead, so the client
  // never gets stuck in a half-logged-in state.
  return withCookies({ data: { ok: true } }, 200, clearSessionCookieHeaders());
});
