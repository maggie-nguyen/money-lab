/**
 * Browser session cookies for the web client.
 *
 * The JSON API accepts a Bearer token, but the browser app never holds tokens in
 * JavaScript. Instead the /api/session/* routes exchange credentials for two
 * httpOnly cookies, so XSS cannot read them:
 *   ml_access  - 15 min access JWT, sent to every /api/v1 call (withApi reads it)
 *   ml_refresh - 30 day rotating refresh token, scoped to /api/session only
 *
 * A third cookie, ml_session, carries no credential at all. It is readable by
 * JavaScript purely so the client knows whether a session exists before it
 * fires the bootstrap request, which keeps public pages from producing a 401 on
 * every visit. It lives as long as the refresh token and is cleared with it.
 */
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC } from "@/server/auth/jwt";
import { env } from "@/server/config";

export const ACCESS_COOKIE = "ml_access";
export const REFRESH_COOKIE = "ml_refresh";
export const HINT_COOKIE = "ml_session";

function secure(): boolean {
  return env().APP_ORIGIN.startsWith("https://");
}

function cookie(name: string, value: string, maxAge: number, path: string, httpOnly = true): string {
  const parts = [`${name}=${value}`, `Path=${path}`, `Max-Age=${maxAge}`];
  if (httpOnly) parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (secure()) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookieHeaders(tokens: { accessToken: string; refreshToken: string }): string[] {
  return [
    cookie(ACCESS_COOKIE, tokens.accessToken, ACCESS_TOKEN_TTL_SEC, "/"),
    cookie(REFRESH_COOKIE, tokens.refreshToken, REFRESH_TOKEN_TTL_SEC, "/api/session"),
    cookie(HINT_COOKIE, "1", REFRESH_TOKEN_TTL_SEC, "/", false),
  ];
}

export function clearSessionCookieHeaders(): string[] {
  return [
    cookie(ACCESS_COOKIE, "", 0, "/"),
    cookie(REFRESH_COOKIE, "", 0, "/api/session"),
    cookie(HINT_COOKIE, "", 0, "/", false),
  ];
}

/** Build a JSON response that also installs (or clears) the session cookies. */
export function withCookies(body: unknown, status: number, cookies: string[]): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
