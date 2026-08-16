import { withApi } from "@/server/http";
import { AppError } from "@/server/lib/errors";
import { refresh } from "@/server/services/authService";
import {
  REFRESH_COOKIE,
  clearSessionCookieHeaders,
  sessionCookieHeaders,
  withCookies,
} from "@/server/sessionCookies";

// Called by the client when an /api/v1 call returns 401. Rotates both cookies.
// A failed refresh clears them so the app falls back to the login screen.
export const POST = withApi({ auth: "none", rateLimit: "session-refresh" }, async (ctx) => {
  const token = ctx.req.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) throw new AppError("UNAUTHENTICATED", "No session");
  try {
    const result = await refresh({ refreshToken: token }, ctx.now);
    return withCookies({ data: { ok: true } }, 200, sessionCookieHeaders(result));
  } catch (e) {
    if (e instanceof AppError && e.code === "UNAUTHENTICATED") {
      return withCookies(
        { error: { code: "UNAUTHENTICATED", message: "Session expired", requestId: ctx.requestId } },
        401,
        clearSessionCookieHeaders(),
      );
    }
    throw e;
  }
});
