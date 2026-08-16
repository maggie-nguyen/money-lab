"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { session, ApiError } from "@/lib/api";
import { useSession } from "@/components/Providers";
import { readReturnTo, welcomeHref } from "@/lib/returnTo";
import { Button, Field, Input, Select, Alert } from "@/components/ui";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SplitAuthShell } from "../SplitAuthShell";
import { useProvinces } from "../useProvinces";

export default function SignupPage() {
  const router = useRouter();
  const { bootstrap } = useSession();
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [birthYear, setBirthYear] = React.useState("");
  const [province, setProvince] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const provinces = useProvinces();

  // Already signed in, so there is nothing to sign up for.
  React.useEffect(() => {
    if (bootstrap) router.replace(readReturnTo());
  }, [bootstrap, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await session.signup({
        displayName,
        email,
        password,
        birthYear: birthYear ? Number(birthYear) : undefined,
        province: province || undefined,
      });
      router.replace(welcomeHref(readReturnTo()));
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors();
        if (Object.keys(fe).length > 0) {
          setFieldErrors(fe);
        } else if (err.status === 409) {
          setFormError("Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.");
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError("Không đăng ký được. Vui lòng thử lại.");
      }
      setLoading(false);
    }
  }

  return (
    <SplitAuthShell title="Tạo tài khoản" subtitle="Miễn phí, chỉ mất khoảng một phút.">
      <GoogleButton label="signup_with" />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert tone="critical">{formError}</Alert>}
        <Field label="Tên hiển thị" htmlFor="displayName" error={fieldErrors.displayName}>
          <Input
            id="displayName"
            name="displayName"
            autoComplete="name"
            required
            minLength={2}
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
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
        <Field label="Mật khẩu" htmlFor="password" hint="Ít nhất 8 ký tự." error={fieldErrors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Năm sinh (không bắt buộc)" htmlFor="birthYear" error={fieldErrors.birthYear}>
          <Input
            id="birthYear"
            name="birthYear"
            type="number"
            inputMode="numeric"
            min={1940}
            max={2020}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
          />
        </Field>
        <Field label="Tỉnh/thành (không bắt buộc)" htmlFor="province" error={fieldErrors.province}>
          <Select id="province" name="province" value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">Chọn tỉnh/thành</option>
            {(provinces.data ?? []).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          Bắt đầu miễn phí
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Đã có tài khoản?{" "}
        <Link href="/login" className="text-moss-400 underline hover:text-moss-600">
          Đăng nhập
        </Link>
      </p>
    </SplitAuthShell>
  );
}
