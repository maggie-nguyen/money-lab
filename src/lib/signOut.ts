/**
 * Signing out, done in one place.
 *
 * The naive version races itself. Clearing the cookies flips the session to
 * signed out while the app layout is still mounted, its redirect effect fires,
 * and the learner lands on the login screen with a ?next= back to the page they
 * just left rather than on the destination the button promised.
 *
 * So the flag goes up first and the app layout stands down while it is up, and
 * the last step is a full document load rather than a client navigation. That
 * also drops every cached query and every piece of in-memory state, which is
 * what a shared school computer needs from a sign out anyway.
 */
import { session } from "@/lib/api";

let leaving = false;

/** True once a deliberate sign out has started. Redirect effects must stand down. */
export function isSigningOut(): boolean {
  return leaving;
}

export async function signOut(to = "/"): Promise<void> {
  leaving = true;
  await session.logout().catch(() => undefined);
  if (typeof window !== "undefined") window.location.assign(to);
}
