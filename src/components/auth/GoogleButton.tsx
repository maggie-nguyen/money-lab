"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { session, ApiError } from "@/lib/api";
import { BOOTSTRAP_KEY, useT } from "@/components/Providers";
import { readReturnTo, welcomeHref } from "@/lib/returnTo";
import { Alert } from "@/components/ui";

/**
 * Google Sign-In, rendered by Google Identity Services.
 *
 * We use the id_token flow rather than the authorization code flow: the browser
 * receives a signed token directly, the server verifies it against Google's
 * JWKS, and no client secret or redirect round trip is involved. That keeps the
 * whole thing to one public client id.
 *
 * With NEXT_PUBLIC_GOOGLE_CLIENT_ID unset the component renders nothing, so
 * local dev and CI work without Google credentials and the password form below
 * remains the only way in.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GsiCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (res: GsiCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

let scriptPromise: Promise<void> | null = null;

/** Load the GSI script once per page, even if both auth screens mount it. */
function loadGsi(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) resolve();
      else existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gsi load failed")));
      return;
    }
    const el = document.createElement("script");
    el.src = GSI_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("gsi load failed"));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

export function GoogleButton({ label = "signin_with" }: { label?: "signin_with" | "signup_with" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useT();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Held in a ref so the GSI callback, which is registered once, always sees the
  // current handler instead of the one from first render.
  const onCredential = React.useRef<(res: GsiCredentialResponse) => void>(() => {});
  onCredential.current = (res) => {
    if (!res.credential) return;
    setError(null);
    void (async () => {
      try {
        const data = (await session.google(res.credential as string)) as { isNewUser?: boolean };
        await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
        // A returning learner goes back to whatever sent them here. A new one
        // needs the welcome flow first, so their destination waits.
        router.replace(data.isNewUser ? welcomeHref(readReturnTo()) : readReturnTo());
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 401
            ? t("auth.google.authFailed")
            : t("auth.google.failed"),
        );
      }
    })();
  };

  React.useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    void loadGsi()
      .then(() => {
        const id = window.google?.accounts?.id;
        if (cancelled || !id || !hostRef.current) return;
        id.initialize({
          client_id: CLIENT_ID,
          callback: (res) => onCredential.current(res),
          // No One Tap prompt: on a shared school computer it offers the last
          // student's account, which is the wrong default here.
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        hostRef.current.innerHTML = "";
        id.renderButton(hostRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: label,
          logo_alignment: "center",
          locale: "vi",
          width: 320,
        });
      })
      .catch(() => {
        if (!cancelled) setError(t("auth.google.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [label, t]);

  if (!CLIENT_ID) return null;

  return (
    <div className="mb-6">
      {error && (
        <div className="mb-3">
          <Alert tone="critical">{error}</Alert>
        </div>
      )}
      <div ref={hostRef} className="flex justify-center [&>div]:!w-full" />
      <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-ink-soft">
        <span className="h-px flex-1 bg-rule" />
        {t("auth.google.or")}
        <span className="h-px flex-1 bg-rule" />
      </div>
    </div>
  );
}
