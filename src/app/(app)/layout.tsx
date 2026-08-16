"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/components/Providers";
import { loginHref } from "@/lib/returnTo";
import { isSigningOut } from "@/lib/signOut";
import { ErrorPanel, Skeleton } from "@/components/ui";

/**
 * Shell for every signed-in screen. The session check runs on the client
 * because auth lives in an httpOnly cookie that the API validates per request;
 * the server render stays identical for all users and therefore cacheable.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isSignedOut, error, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!isSignedOut) return;
    // A deliberate sign out is already navigating somewhere it chose.
    if (isSigningOut()) return;
    // The query string comes from location rather than useSearchParams, which
    // would opt every screen under this layout out of static rendering.
    const search = typeof window === "undefined" ? "" : window.location.search;
    router.replace(loginHref(`${pathname}${search}`));
  }, [isSignedOut, router, pathname]);

  return (
    <AppShell>
      {isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isSignedOut ? (
        <p className="text-sm text-ink-soft">Đang chuyển tới trang đăng nhập...</p>
      ) : error ? (
        // The session is probably fine, the server just did not answer. Sending
        // the learner to the login page would be a lie, and rendering the screen
        // would leave it waiting on data that never comes, so say so and offer
        // the retry.
        <ErrorPanel error={error} onRetry={() => void refresh()} />
      ) : (
        children
      )}
    </AppShell>
  );
}
