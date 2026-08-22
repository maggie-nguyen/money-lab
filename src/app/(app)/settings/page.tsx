"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { BOOTSTRAP_KEY, useMe, useT } from "@/components/Providers";
import { signOut } from "@/lib/signOut";
import {
  Button,
  Card,
  CardBody,
  SectionTitle,
  Field,
  Input,
  Select,
  Alert,
  Dialog,
} from "@/components/ui";
import type { Me } from "@/lib/types";
import { useProvinces } from "../../useProvinces";

type Theme = "light" | "dark";

function ThemeSection() {
  const t = useT();
  const [theme, setTheme] = React.useState<Theme | null>(null);

  React.useEffect(() => {
    const saved = window.localStorage.getItem("ml-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);

  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("ml-theme", next);
    setTheme(next);
  }

  return (
    <Card>
      <CardBody>
        <SectionTitle>{t("settings.theme")}</SectionTitle>
        <div className="flex gap-3">
          <Button variant={theme === "light" ? "primary" : "secondary"} onClick={() => apply("light")}>
            {t("settings.themeLight")}
          </Button>
          <Button variant={theme === "dark" ? "primary" : "secondary"} onClick={() => apply("dark")}>
            {t("settings.themeDark")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ProfileSection({ me }: { me: Me }) {
  const qc = useQueryClient();
  const provinces = useProvinces();
  const t = useT();
  const [displayName, setDisplayName] = React.useState(me.displayName);
  const [province, setProvince] = React.useState(me.province ?? "");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () =>
      api.patch<Me>("/me", {
        displayName,
        province: province || null,
      }),
    onSuccess: () => {
      setFieldErrors({});
      void qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
    },
    onError: (err) => {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors());
    },
  });

  return (
    <Card>
      <CardBody>
        <SectionTitle>{t("settings.profile")}</SectionTitle>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {save.isError && !(save.error instanceof ApiError && save.error.fieldErrors().displayName) && (
            <Alert tone="critical">{t("common.saveFailed")}</Alert>
          )}
          {save.isSuccess && <Alert tone="positive">{t("settings.saved")}</Alert>}
          <Field label={t("settings.displayName")} htmlFor="displayName" error={fieldErrors.displayName}>
            <Input
              id="displayName"
              value={displayName}
              minLength={2}
              maxLength={40}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label={t("settings.province")} htmlFor="province" error={fieldErrors.province}>
            <Select id="province" value={province} onChange={(e) => setProvince(e.target.value)}>
              <option value="">{t("settings.provinceNone")}</option>
              {(provinces.data ?? []).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={save.isPending}>
            {t("settings.save")}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordSection() {
  const t = useT();
  const [email, setEmail] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const me = useMe();

  React.useEffect(() => {
    setEmail(me?.email ?? null);
  }, [me]);

  async function sendReset() {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      setError(t("settings.passwordSendFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <SectionTitle>{t("settings.password")}</SectionTitle>
        {!email ? (
          <p className="text-sm text-ink-soft">{t("settings.passwordNoEmail")}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">{t("settings.passwordHint", { email })}</p>
            {error && <Alert tone="critical">{error}</Alert>}
            {sent && <Alert tone="positive">{t("settings.passwordSent")}</Alert>}
            <Button variant="secondary" onClick={sendReset} loading={loading} disabled={sent}>
              {t("settings.passwordSend")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function AccountActionsSection() {
  const t = useT();
  const [logoutAllLoading, setLogoutAllLoading] = React.useState(false);
  const [logoutAllError, setLogoutAllError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  async function logout() {
    await signOut("/login");
  }

  async function logoutAllDevices() {
    setLogoutAllLoading(true);
    setLogoutAllError(null);
    try {
      await api.post("/auth/logout", { allDevices: true });
    } catch {
      setLogoutAllError(t("settings.logoutAllFailed"));
      setLogoutAllLoading(false);
      return;
    }
    await signOut("/login");
  }

  async function deleteAccount() {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.del("/me", { confirm: "DELETE" });
    } catch {
      setDeleteError(t("settings.deleteFailed"));
      setDeleteLoading(false);
      return;
    }
    await signOut("/");
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <SectionTitle>{t("settings.account")}</SectionTitle>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={logout}>
            {t("settings.logout")}
          </Button>
          <Button variant="secondary" onClick={logoutAllDevices} loading={logoutAllLoading}>
            {t("settings.logoutAll")}
          </Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            {t("settings.delete")}
          </Button>
        </div>
        {logoutAllError && <Alert tone="critical">{logoutAllError}</Alert>}
      </CardBody>

      <Dialog
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setConfirmText("");
          setDeleteError(null);
        }}
        title={t("settings.deleteTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={deleteAccount}
              loading={deleteLoading}
              disabled={confirmText !== "DELETE"}
            >
              {t("settings.deleteForever")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">{t("settings.deleteConfirm")}</p>
        {deleteError && (
          <div className="mt-3">
            <Alert tone="critical">{deleteError}</Alert>
          </div>
        )}
        <div className="mt-3">
          <Input
            aria-label={t("settings.deleteAria")}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>
      </Dialog>
    </Card>
  );
}

export default function SettingsPage() {
  const me = useMe();
  const t = useT();

  if (!me) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("settings.subtitle")}</p>
      </div>
      <ProfileSection me={me} />
      <ThemeSection />
      <PasswordSection />
      <AccountActionsSection />
    </div>
  );
}
