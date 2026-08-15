"use client";

/**
 * User search and detail (doc 10 scope, doc 03 §14.4). Only the admin actions
 * the API actually exposes: PATCH role/displayName, ban, unban, delete.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  LedgerTable,
  SectionTitle,
  Select,
  Skeleton,
} from "@/components/ui";
import { formatDate, formatInt } from "@/lib/format";

type Role = "LEARNER" | "ADMIN";
type UserStatus = "active" | "banned" | "deleted";

interface AdminUser {
  id: string;
  email: string | null;
  displayName: string;
  role: Role;
  province: string | null;
  localePref: string;
  lastActiveAt: string;
  bannedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  stats: { xpTotal: number; coins: number; streakCurrent: number } | null;
}

function UserDetail({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = React.useState(user.displayName);
  const [role, setRole] = React.useState<Role>(user.role);
  const [banReason, setBanReason] = React.useState("");

  React.useEffect(() => {
    setDisplayName(user.displayName);
    setRole(user.role);
    setBanReason("");
  }, [user]);

  const patch = useMutation({
    mutationFn: () => api.patch<AdminUser>(`/admin/users/${user.id}`, { displayName, role }),
    onSuccess: (u) => {
      qc.setQueryData(["admin-user", user.id], u);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const ban = useMutation({
    mutationFn: () => api.post<AdminUser>(`/admin/users/${user.id}/ban`, { reason: banReason }),
    onSuccess: (u) => {
      qc.setQueryData(["admin-user", user.id], u);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      setBanReason("");
    },
  });

  const unban = useMutation({
    mutationFn: () => api.post<AdminUser>(`/admin/users/${user.id}/unban`, {}),
    onSuccess: (u) => {
      qc.setQueryData(["admin-user", user.id], u);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/admin/users/${user.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      onChanged();
    },
  });

  const patchError = patch.error instanceof ApiError ? patch.error : null;
  const banError = ban.error instanceof ApiError ? ban.error : null;
  const unbanError = unban.error instanceof ApiError ? unban.error : null;
  const removeError = remove.error instanceof ApiError ? remove.error : null;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">{user.displayName}</h3>
            <p className="text-xs text-ink-faint">{user.email ?? "Chưa gắn email"}</p>
          </div>
          <div className="flex gap-2">
            {user.bannedAt && <Chip tone="critical">Đã cấm</Chip>}
            {user.deletedAt && <Chip tone="neutral">Đã xóa</Chip>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-y border-rule py-3 sm:grid-cols-4">
          <div>
            <div className="ledger-label">XP</div>
            <div className="figure">{formatInt(user.stats?.xpTotal ?? 0)}</div>
          </div>
          <div>
            <div className="ledger-label">Xu</div>
            <div className="figure">{formatInt(user.stats?.coins ?? 0)}</div>
          </div>
          <div>
            <div className="ledger-label">Chuỗi ngày học</div>
            <div className="figure">{formatInt(user.stats?.streakCurrent ?? 0)}</div>
          </div>
          <div>
            <div className="ledger-label">Hoạt động gần nhất</div>
            <div>{formatDate(user.lastActiveAt)}</div>
          </div>
        </div>

        {user.deletedAt ? (
          <p className="text-sm text-ink-soft">Tài khoản đã bị xóa, không thể chỉnh sửa thêm.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên hiển thị" error={patchError?.fieldErrors("").displayName}>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </Field>
              <Field label="Vai trò" error={patchError?.fieldErrors("").role}>
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="LEARNER">Học sinh</option>
                  <option value="ADMIN">Quản trị viên</option>
                </Select>
              </Field>
            </div>

            {patchError && (
              <Alert tone="critical" title="Không lưu được">
                {patchError.ruleCode === "LAST_ADMIN"
                  ? "Không thể hạ quyền quản trị viên cuối cùng."
                  : patchError.message}
              </Alert>
            )}

            <div className="flex justify-end">
              <Button onClick={() => patch.mutate()} loading={patch.isPending} disabled={patch.isPending}>
                Lưu thông tin
              </Button>
            </div>

            <div className="space-y-2 border-t border-rule pt-4">
              {user.bannedAt ? (
                <>
                  {unbanError && (
                    <Alert tone="critical" title="Không thể bỏ cấm">
                      {unbanError.message}
                    </Alert>
                  )}
                  <Button variant="secondary" onClick={() => unban.mutate()} loading={unban.isPending} disabled={unban.isPending}>
                    Bỏ cấm
                  </Button>
                </>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Lý do cấm" error={banError?.fieldErrors("").reason} htmlFor="ban-reason">
                    <Input id="ban-reason" value={banReason} onChange={(e) => setBanReason(e.target.value)} className="w-64" />
                  </Field>
                  <Button
                    variant="danger"
                    onClick={() => ban.mutate()}
                    loading={ban.isPending}
                    disabled={ban.isPending || !banReason.trim()}
                  >
                    Cấm tài khoản
                  </Button>
                </div>
              )}
              {banError && !banError.fieldErrors("").reason && (
                <Alert tone="critical" title="Không thể cấm">
                  {banError.ruleCode === "SELF_BAN"
                    ? "Bạn không thể tự cấm chính mình."
                    : banError.ruleCode === "ADMIN_BAN"
                      ? "Hạ quyền quản trị viên trước khi cấm."
                      : banError.message}
                </Alert>
              )}
            </div>

            <div className="border-t border-rule pt-4">
              {removeError && (
                <Alert tone="critical" title="Không thể xóa">
                  {removeError.ruleCode === "SELF_DELETE" ? "Không thể tự xóa tài khoản của mình ở đây." : removeError.message}
                </Alert>
              )}
              <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending} disabled={remove.isPending}>
                Xóa tài khoản
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default function AdminUsersPage() {
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState<Role | "">("");
  const [status, setStatus] = React.useState<UserStatus | "">("");
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = React.useState<string[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Changing a filter starts the list over. Done in the setter rather than in
  // an effect, so the query never fires once with the previous page's cursor
  // against the new filter before the reset lands.
  function changeFilter<T>(set: (v: T) => void) {
    return (value: T) => {
      set(value);
      setCursor(undefined);
      setCursorStack([]);
    };
  }

  const list = useQuery({
    queryKey: ["admin-users", q, role, status, cursor],
    queryFn: () =>
      api.getWithMeta<AdminUser[], { nextCursor: string | null }>("/admin/users", {
        q: q || undefined,
        role: role || undefined,
        status: status || undefined,
        cursor,
        limit: 20,
      }),
  });
  const nextCursor = list.data?.meta?.nextCursor ?? undefined;

  const detail = useQuery({
    queryKey: ["admin-user", selectedId],
    queryFn: () => api.get<AdminUser>(`/admin/users/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  return (
    <div className="space-y-6">
      <SectionTitle>Người dùng</SectionTitle>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Tìm kiếm" htmlFor="user-search">
          <Input id="user-search" value={q} onChange={(e) => changeFilter(setQ)(e.target.value)} placeholder="Email, tên hoặc ID" className="w-64" />
        </Field>
        <label className="text-sm">
          <span className="ledger-label mb-1 block">Vai trò</span>
          <Select value={role} onChange={(e) => changeFilter(setRole)(e.target.value as Role | "")}>
            <option value="">Tất cả</option>
            <option value="LEARNER">Học sinh</option>
            <option value="ADMIN">Quản trị viên</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="ledger-label mb-1 block">Trạng thái</span>
          <Select value={status} onChange={(e) => changeFilter(setStatus)(e.target.value as UserStatus | "")}>
            <option value="">Tất cả</option>
            <option value="active">Đang hoạt động</option>
            <option value="banned">Đã cấm</option>
            <option value="deleted">Đã xóa</option>
          </Select>
        </label>
      </div>

      {list.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : list.isError ? (
        <ErrorPanel error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data || list.data.data.length === 0 ? (
        <EmptyState title="Không tìm thấy người dùng" description="Đổi từ khóa hoặc bộ lọc." />
      ) : (
        <Card>
          <CardBody>
            <LedgerTable
              headers={["Tên", "Email", "Vai trò", "Trạng thái", "Tham gia", ""]}
              align={["left", "left", "left", "left", "left", "left"]}
              rows={list.data.data.map((u) => [
                u.displayName,
                u.email ?? "-",
                <Chip key="role" tone={u.role === "ADMIN" ? "moss" : "neutral"}>
                  {u.role === "ADMIN" ? "Quản trị viên" : "Học sinh"}
                </Chip>,
                u.deletedAt ? (
                  <Chip key="status" tone="neutral">Đã xóa</Chip>
                ) : u.bannedAt ? (
                  <Chip key="status" tone="critical">Đã cấm</Chip>
                ) : (
                  <Chip key="status" tone="positive">Hoạt động</Chip>
                ),
                formatDate(u.createdAt),
                <Button key="detail" size="sm" variant="secondary" onClick={() => setSelectedId(u.id)}>
                  Xem chi tiết
                </Button>,
              ])}
            />
          </CardBody>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-faint">
          {list.data ? `${list.data.data.length} người dùng ở trang này` : ""}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={cursorStack.length === 0}
            onClick={() => {
              const next = [...cursorStack];
              const prev = next.pop();
              setCursorStack(next);
              setCursor(prev);
            }}
          >
            Trang trước
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!nextCursor}
            onClick={() => {
              if (!nextCursor) return;
              setCursorStack((prev) => [...prev, cursor ?? ""]);
              setCursor(nextCursor);
            }}
          >
            Trang sau
          </Button>
        </div>
      </div>

      {selectedId && (
        <div>
          {detail.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : detail.isError ? (
            <ErrorPanel error={detail.error} onRetry={() => detail.refetch()} />
          ) : detail.data ? (
            <UserDetail user={detail.data} onChanged={() => setSelectedId(null)} />
          ) : null}
        </div>
      )}
    </div>
  );
}
