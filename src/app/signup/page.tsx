"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { session, ApiError } from "@/lib/api";
import { useSession, useT } from "@/components/Providers";
import { readReturnTo, welcomeHref } from "@/lib/returnTo";
import { Button, Field, Input, Select, Alert } from "@/components/ui";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SplitAuthShell } from "../SplitAuthShell";
import { useProvinces } from "../useProvinces";

export default function SignupPage() {
  const router = useRouter();
  const { bootstrap } = useSession();
  const t = useT();
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [birthYear, setBirthYear] = React.useState("");
  const [province, setProvince] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const provinces = useProvinces();

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
          setFormError(t("auth.signup.emailTaken"));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError(t("auth.signup.failed"));
      }
      setLoading(false);
    }
  }

  return (
    <SplitAuthShell title={t("auth.signup.title")} subtitle={t("auth.signup.subtitle")}>
      <GoogleButton label="signup_with" />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert tone="critical">{formError}</Alert>}
        <Field label={t("auth.signup.displayName")} htmlFor="displayName" error={fieldErrors.displayName}>
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
        <Field label={t("auth.signup.password")} htmlFor="password" error={fieldErrors.password}>
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
        <Field label={t("auth.signup.birthYear")} htmlFor="birthYear" error={fieldErrors.birthYear}>
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
        <Field label={t("auth.signup.province")} htmlFor="province" error={fieldErrors.province}>
          <Select id="province" name="province" value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">{t("auth.signup.provinceNone")}</option>
            {(provinces.data ?? []).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          {t("nav.startFree")}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        {t("auth.signup.hasAccount")}{" "}
        <Link href="/login" className="text-moss-400 underline hover:text-moss-600">
          {t("auth.signup.loginLink")}
        </Link>
      </p>
    </SplitAuthShell>
  );
}
