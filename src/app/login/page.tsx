"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { session, ApiError } from "@/lib/api";
import { BOOTSTRAP_KEY, useSession, useT } from "@/components/Providers";
import { readReturnTo } from "@/lib/returnTo";
import { Button, Field, Input, Alert } from "@/components/ui";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SplitAuthShell } from "../SplitAuthShell";

/** Says what actually went wrong. A rate limit is not a wrong password. */
function loginErrorMessage(err: unknown, t: ReturnType<typeof useT>): string {
  if (!(err instanceof ApiError)) return t("error.network");
  if (err.status === 429) {
    const mins = err.retryAfterSec ? Math.max(1, Math.ceil(err.retryAfterSec / 60)) : null;
    return mins
      ? t("auth.login.rateLimited", { mins })
      : t("auth.login.rateLimitedShort");
  }
  if (err.status >= 500) return t("error.server");
  return t("auth.login.badCredentials");
}

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { bootstrap } = useSession();
  const t = useT();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (bootstrap) router.replace(readReturnTo());
  }, [bootstrap, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await session.login(email, password);
      await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      router.replace(readReturnTo());
    } catch (err) {
      setError(loginErrorMessage(err, t));
      setLoading(false);
    }
  }

  return (
    <SplitAuthShell title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      <GoogleButton label="signin_with" />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="critical">{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t("auth.login.password")} htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          {t("auth.login.submit")}
        </Button>
      </form>
      <div className="mt-6 space-y-2 text-center text-sm text-ink-soft">
        <p>
          {t("auth.login.noAccount")}{" "}
          <Link href="/signup" className="text-moss-400 underline hover:text-moss-600">
            {t("auth.login.signupLink")}
          </Link>
        </p>
        <p>
          <Link href="/library" className="text-moss-400 underline hover:text-moss-600">
            {t("nav.library")}
          </Link>
        </p>
      </div>
    </SplitAuthShell>
  );
}
