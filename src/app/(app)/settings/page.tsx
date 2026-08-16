"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { BOOTSTRAP_KEY, useMe } from "@/components/Providers";
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
import type { Me, Locale } from "@/lib/types";
import { useProvinces } from "../../useProvinces";

type Theme = "light" | "dark";

function ThemeSection() {
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
        <SectionTitle>Giao diện</SectionTitle>
        <div className="flex gap-3">
          <Button variant={theme === "light" ? "primary" : "secondary"} onClick={() => apply("light")}>
            Sáng
          </Button>
          <Button variant={theme === "dark" ? "primary" : "secondary"} onClick={() => apply("dark")}>
            Tối
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ProfileSection({ me }: { me: Me }) {
  const qc = useQueryClient();
  const provinces = useProvinces();
  const [displayName, setDisplayName] = React.useState(me.displayName);
  const [province, setProvince] = React.useState(me.province ?? "");
  const [localePref, setLocalePref] = React.useState<Locale>(me.localePref);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () =>
      api.patch<Me>("/me", {
        displayName,
        province: province || null,
        localePref,
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
        <SectionTitle>Hồ sơ</SectionTitle>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {save.isError && !(save.error instanceof ApiError && save.error.fieldErrors().displayName) && (
            <Alert tone="critical">Không lưu được thay đổi. Vui lòng thử lại.</Alert>
          )}
          {save.isSuccess && <Alert tone="positive">Đã lưu hồ sơ.</Alert>}
          <Field label="Tên hiển thị" htmlFor="displayName" error={fieldErrors.displayName}>
            <Input
              id="displayName"
              value={displayName}
              minLength={2}
              maxLength={40}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label="Tỉnh/thành" htmlFor="province" error={fieldErrors.province}>
            <Select id="province" value={province} onChange={(e) => setProvince(e.target.value)}>
              <option value="">Chưa chọn</option>
              {(provinces.data ?? []).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ngôn ngữ" htmlFor="localePref" error={fieldErrors.localePref}>
            <Select id="localePref" value={localePref} onChange={(e) => setLocalePref(e.target.value as Locale)}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Button type="submit" loading={save.isPending}>
            Lưu thay đổi
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordSection() {
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
      setError("Không gửi được yêu cầu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <SectionTitle>Mật khẩu</SectionTitle>
        {!email ? (
          <p className="text-sm text-ink-soft">Tài khoản này chưa gắn email nên chưa đổi được mật khẩu.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              Chúng tôi sẽ gửi một liên kết đặt lại mật khẩu tới {email}.
            </p>
            {error && <Alert tone="critical">{error}</Alert>}
            {sent && <Alert tone="positive">Đã gửi liên kết đặt lại mật khẩu tới email của bạn.</Alert>}
            <Button variant="secondary" onClick={sendReset} loading={loading} disabled={sent}>
              Gửi liên kết đổi mật khẩu
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function AccountActionsSection() {
  const [logoutAllLoading, setLogoutAllLoading] = React.useState(false);
  const [logoutAllError, setLogoutAllError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  async function logout() {
    await signOut("/login");
  }

  /**
   * /auth/logout revokes refresh tokens in the database, which ends every other
   * device. It cannot end this one: the access cookie is a stateless 15 minute
   * JWT and the API never sees this browser's cookie jar. Without the session
   * call below, "log out all devices" leaves the device you clicked it on signed
   * in until that token expires, and a reload puts you straight back in.
   */
  async function logoutAllDevices() {
    setLogoutAllLoading(true);
    setLogoutAllError(null);
    try {
      await api.post("/auth/logout", { allDevices: true });
    } catch {
      setLogoutAllError("Không đăng xuất được mọi thiết bị. Vui lòng thử lại.");
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
      setDeleteError("Không xóa được tài khoản. Vui lòng thử lại.");
      setDeleteLoading(false);
      return;
    }
    // The account is gone, so the cookies must go with it rather than being
    // left to expire on their own.
    await signOut("/");
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <SectionTitle>Tài khoản</SectionTitle>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={logout}>
            Đăng xuất
          </Button>
          <Button variant="secondary" onClick={logoutAllDevices} loading={logoutAllLoading}>
            Đăng xuất mọi thiết bị
          </Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Xóa tài khoản
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
        title="Xóa tài khoản"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={deleteAccount}
              loading={deleteLoading}
              disabled={confirmText !== "DELETE"}
            >
              Xóa vĩnh viễn
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Hành động này không thể hoàn tác. Toàn bộ tiến trình học, xu và huy hiệu sẽ mất. Nhập{" "}
          <span className="figure font-semibold text-ink">DELETE</span> để xác nhận.
        </p>
        {deleteError && (
          <div className="mt-3">
            <Alert tone="critical">{deleteError}</Alert>
          </div>
        )}
        <div className="mt-3">
          <Input
            aria-label="Nhập DELETE để xác nhận"
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

  if (!me) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">Cài đặt</h1>
        <p className="mt-1 text-sm text-ink-soft">Quản lý hồ sơ, giao diện và tài khoản của bạn.</p>
      </div>
      <ProfileSection me={me} />
      <ThemeSection />
      <PasswordSection />
      <AccountActionsSection />
    </div>
  );
}
