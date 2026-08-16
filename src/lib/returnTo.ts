/**
 * Where a learner lands after signing in.
 *
 * Without this the app forgets what the user was trying to reach. A shared link
 * to a lesson, or an access token that expired halfway through one, both end on
 * the login screen and then dump the learner on /learn.
 *
 * The destination travels in ?next= on the login link, so it is attacker
 * controllable and is never used before safeReturnTo has checked it. A value is
 * only accepted when it is a path on this origin: "//evil.example" and
 * "/\evil.example" are parsed by browsers as URLs rather than paths, which is
 * why the second character matters. The auth screens themselves are rejected
 * too, since returning to them would loop.
 */
export const RETURN_PARAM = "next";
export const DEFAULT_AFTER_LOGIN = "/learn";

const AUTH_PATHS = ["/login", "/signup", "/welcome"];

export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_LOGIN;
  if (!raw.startsWith("/")) return DEFAULT_AFTER_LOGIN;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_AFTER_LOGIN;
  const path = raw.split("?")[0] ?? raw;
  if (AUTH_PATHS.includes(path)) return DEFAULT_AFTER_LOGIN;
  return raw;
}

/** The login url that will bring the learner back to where they were. */
export function loginHref(target: string): string {
  const safe = safeReturnTo(target);
  if (safe === DEFAULT_AFTER_LOGIN) return "/login";
  return `/login?${RETURN_PARAM}=${encodeURIComponent(safe)}`;
}

/** The welcome screen, carrying the destination through to the end of it. */
export function welcomeHref(target: string): string {
  const safe = safeReturnTo(target);
  if (safe === DEFAULT_AFTER_LOGIN) return "/welcome";
  return `/welcome?${RETURN_PARAM}=${encodeURIComponent(safe)}`;
}

/**
 * Read the destination out of the current url. Called from event handlers and
 * effects rather than during render, so it needs no useSearchParams and cannot
 * force the auth screens out of static rendering.
 */
export function readReturnTo(): string {
  if (typeof window === "undefined") return DEFAULT_AFTER_LOGIN;
  return safeReturnTo(new URLSearchParams(window.location.search).get(RETURN_PARAM));
}
