"use client";

import * as React from "react";
import Link from "next/link";
import { hasSessionHint, onSessionHintChange } from "@/lib/api";
import { useT } from "@/components/Providers";
import { Button } from "@/components/ui";

/**
 * Auth corner for the public header (landing + library for guests).
 * Signed-in users use the main nav tabs instead of a separate "Vào học" shortcut.
 */
export function PublicNavAuth() {
  const t = useT();
  const [signedIn, setSignedIn] = React.useState(false);

  React.useEffect(() => {
    setSignedIn(hasSessionHint());
    return onSessionHintChange(() => setSignedIn(hasSessionHint()));
  }, []);

  if (signedIn) {
    return (
      <Link href="/profile" className="text-sm font-medium text-ink-soft hover:text-ink">
        {t("nav.account")}
      </Link>
    );
  }

  return (
    <>
      <Link href="/login" className="text-ink-soft hover:text-ink">
        {t("nav.signIn")}
      </Link>
      <Link href="/signup">
        <Button size="sm">{t("nav.startFree")}</Button>
      </Link>
    </>
  );
}
