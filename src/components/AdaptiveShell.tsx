"use client";

import * as React from "react";
import { AppShell } from "@/components/AppShell";
import { PublicChrome } from "@/components/PublicChrome";
import { hasSessionHint, onSessionHintChange } from "@/lib/api";

/**
 * Public pages that should share the signed-in app nav when a session exists.
 * Library stays statically rendered for guests; signed-in readers get AppShell
 * after hydration so Thư viện sits in the same tab bar as Bản đồ and Ví.
 */
export function AdaptiveShell({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setSignedIn(hasSessionHint());
    setReady(true);
    return onSessionHintChange(() => setSignedIn(hasSessionHint()));
  }, []);

  if (ready && signedIn) {
    return <AppShell>{children}</AppShell>;
  }

  return <PublicChrome>{children}</PublicChrome>;
}
