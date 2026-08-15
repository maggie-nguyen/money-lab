"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/components/Providers";
import { Skeleton } from "@/components/ui";

/**
 * Shell for every signed-in screen. The session check runs on the client
 * because auth lives in an httpOnly cookie that the API validates per request;
 * the server render stays identical for all users and therefore cacheable.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isSignedOut } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (isSignedOut) router.replace("/login");
  }, [isSignedOut, router]);

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
      ) : (
        children
      )}
    </AppShell>
  );
}
