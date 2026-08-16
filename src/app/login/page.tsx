"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { session, ApiError } from "@/lib/api";
import { BOOTSTRAP_KEY, useSession } from "@/components/Providers";
import { readReturnTo } from "@/lib/returnTo";
import { Button, Field, Input, Alert } from "@/components/ui";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SplitAuthShell } from "../SplitAuthShell";

/** Says what actually went wrong. A rate limit is not a wrong password. */
function loginErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Không kết nối được máy chủ. Vui lòng thử lại.";
  if (err.status === 429) {
    const mins = err.retryAfterSec ? Math.max(1, Math.ceil(err.retryAfterSec / 60)) : null;
    return mins
      ? `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi khoảng ${mins} phút rồi thử lại.`
      : "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi một lát rồi thử lại.";
  }
  if (err.status >= 500) return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.";
  // The server returns the same message whether the email exists or not.
  return "Email hoặc mật khẩu không đúng.";
}

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { bootstrap } = useSession();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Someone who is already signed in has no business on this screen, whether
  // they typed the url, hit Back after logging in, or reloaded the tab.
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
      // replace, so Back from the app does not land on a login form.
      router.replace(readReturnTo());
    } catch (err) {
      setError(loginErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <SplitAuthShell title="Đăng nhập" subtitle="Tiếp tục lộ trình học.">
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
        <Field label="Mật khẩu" htmlFor="password">
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
          Đăng nhập
        </Button>
      </form>
      <div className="mt-6 space-y-2 text-center text-sm text-ink-soft">
        <p>
          Chưa có tài khoản?{" "}
          <Link href="/signup" className="text-moss-400 underline hover:text-moss-600">
            Đăng ký
          </Link>
        </p>
        <p>
          <Link href="/library" className="text-moss-400 underline hover:text-moss-600">
            Đọc thư viện bài viết
          </Link>
        </p>
      </div>
    </SplitAuthShell>
  );
}
