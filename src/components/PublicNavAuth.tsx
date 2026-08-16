"use client";

import * as React from "react";
import Link from "next/link";
import { hasSessionHint, onSessionHintChange } from "@/lib/api";
import { useT } from "@/components/Providers";
import { Button } from "@/components/ui";

/**
 * The auth corner of the public header.
 *
 * The library is statically rendered, so the server cannot know who is reading
 * it without making every request dynamic. This resolves after hydration from
 * the readable `ml_session` hint instead, which holds no credential: the worst
 * case is a signed-in reader seeing the signed-out links for one frame.
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
      <Link href="/learn">
        <Button size="sm">{t("nav.enterLearn")}</Button>
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
