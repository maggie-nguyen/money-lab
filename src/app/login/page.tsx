"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { session, ApiError } from "@/lib/api";
import { BOOTSTRAP_KEY } from "@/components/Providers";
import { Button, Field, Input, Alert } from "@/components/ui";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SplitAuthShell } from "../SplitAuthShell";

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await session.login(email, password);
      await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      router.push("/learn");
    } catch (err) {
      // The server returns the same message whether the email exists or not.
      setError(
        err instanceof ApiError
          ? "Email hoặc mật khẩu không đúng."
          : "Không đăng nhập được. Vui lòng thử lại.",
      );
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
