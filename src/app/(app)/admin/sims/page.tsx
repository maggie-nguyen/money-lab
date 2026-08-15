"use client";

/**
 * Sim definitions (doc 10 scope): list plus the engine config editor.
 *
 * Doc 03 §14.1 has no standalone "validate" or "smoke-test" endpoint: the
 * Zod schema check and the 3-turn smoke simulation both run server-side as
 * part of POST /admin/sims/{id}/publish (src/server/services/adminContentService.ts
 * smokeSimulate). "Lưu cấu hình" persists via PATCH (loose shape check only);
 * "Xuất bản" is what actually validates and smoke-tests the config, and
 * failures come back as RULE_VIOLATION with per-path details.
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
  Textarea,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { SimType } from "@/lib/types";

type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã xuất bản",
  ARCHIVED: "Đã lưu trữ",
};
const STATUS_TONE: Record<Status, "neutral" | "positive" | "caution"> = {
  DRAFT: "caution",
  PUBLISHED: "positive",
  ARCHIVED: "neutral",
};

interface AdminSim {
  id: string;
  slug: string;
  type: SimType;
  status: Status;
  order: number;
  configVersion: number;
  config: unknown;
  estimatedMinutes: number;
  xpRewardComplete: number;
  etag: string;
  updatedAt: string;
  i18n: Record<string, { title?: string; subtitle?: string; description?: string } | undefined>;
}

function SimEditor({ sim, onDone }: { sim: AdminSim; onDone: () => void }) {
  const qc = useQueryClient();
  const [configText, setConfigText] = React.useState(() => JSON.stringify(sim.config, null, 2));
  const [order, setOrder] = React.useState(String(sim.order));
  const [estimatedMinutes, setEstimatedMinutes] = React.useState(String(sim.estimatedMinutes));
  const [xpRewardComplete, setXpRewardComplete] = React.useState(String(sim.xpRewardComplete));
  const [title, setTitle] = React.useState(sim.i18n.vi?.title ?? "");
  const [subtitle, setSubtitle] = React.useState(sim.i18n.vi?.subtitle ?? "");
  const [description, setDescription] = React.useState(sim.i18n.vi?.description ?? "");
  const [checklistConfirmed, setChecklistConfirmed] = React.useState(false);
  const [staleNotice, setStaleNotice] = React.useState(false);
  const [configSyntaxError, setConfigSyntaxError] = React.useState("");

  React.useEffect(() => {
    setConfigText(JSON.stringify(sim.config, null, 2));
    setOrder(String(sim.order));
    setEstimatedMinutes(String(sim.estimatedMinutes));
    setXpRewardComplete(String(sim.xpRewardComplete));
    setTitle(sim.i18n.vi?.title ?? "");
    setSubtitle(sim.i18n.vi?.subtitle ?? "");
    setDescription(sim.i18n.vi?.description ?? "");
    setChecklistConfirmed(false);
    setStaleNotice(false);
  }, [sim]);

  function parsedConfig(): { ok: true; value: unknown } | { ok: false } {
    try {
      return { ok: true, value: JSON.parse(configText) };
    } catch {
      return { ok: false };
    }
  }

  function checkSyntax() {
    const r = parsedConfig();
    setConfigSyntaxError(r.ok ? "" : "Cấu hình không phải JSON hợp lệ. Sửa cú pháp trước khi lưu hoặc xuất bản.");
    return r;
  }

  const save = useMutation({
    mutationFn: () => {
      const r = checkSyntax();
      if (!r.ok) throw new Error("INVALID_JSON");
      return api.patch<AdminSim>(
        `/admin/sims/${sim.id}`,
        {
          order: Number(order) || 0,
          estimatedMinutes: Number(estimatedMinutes) || 1,
          xpRewardComplete: Number(xpRewardComplete) || 0,
          config: r.value,
          i18n: { vi: { title, subtitle, description } },
        },
        { ifMatch: sim.etag },
      );
    },
    onSuccess: (rec) => {
      void qc.invalidateQueries({ queryKey: ["admin-sims"] });
      qc.setQueryData(["admin-sim", sim.id], rec);
      setStaleNotice(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.status === 409 || err.code === "VERSION_CONFLICT")) {
        setStaleNotice(true);
      }
    },
  });

  const publish = useMutation({
    mutationFn: () => api.post<AdminSim>(`/admin/sims/${sim.id}/publish`, { checklistConfirmed: true }),
    onSuccess: (rec) => {
      void qc.invalidateQueries({ queryKey: ["admin-sims"] });
      qc.setQueryData(["admin-sim", sim.id], rec);
      setChecklistConfirmed(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.status === 409 || err.code === "VERSION_CONFLICT")) {
        setStaleNotice(true);
      }
    },
  });

  const lifecycle = useMutation({
    mutationFn: (action: "unpublish" | "archive") => api.post<AdminSim>(`/admin/sims/${sim.id}/${action}`, {}),
    onSuccess: (rec) => {
      void qc.invalidateQueries({ queryKey: ["admin-sims"] });
      qc.setQueryData(["admin-sim", sim.id], rec);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => api.del(`/admin/sims/${sim.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-sims"] });
      onDone();
    },
  });

  const saveError = save.error instanceof ApiError ? save.error : null;
  const publishError = publish.error instanceof ApiError ? publish.error : null;
  const removeError = removeMutation.error instanceof ApiError ? removeMutation.error : null;
  const publishDetails = publishError?.details ?? [];

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">
              {sim.slug} <span className="text-ink-faint">· {sim.type}</span>
            </h3>
            <p className="text-xs text-ink-faint">
              Phiên bản cấu hình {sim.configVersion}, cập nhật {formatDate(sim.updatedAt)}
            </p>
          </div>
          <Chip tone={STATUS_TONE[sim.status]}>{STATUS_LABEL[sim.status]}</Chip>
        </div>

        {staleNotice && (
          <Alert tone="warning" title="Cấu hình đã thay đổi">
            Bản ghi này đã được cập nhật ở nơi khác. Đóng và mở lại để tải phiên bản mới nhất.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Thứ tự">
            <Input type="number" className="figure" value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
          <Field label="Thời lượng ước tính (phút)">
            <Input
              type="number"
              className="figure"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
            />
          </Field>
          <Field label="XP khi hoàn thành">
            <Input
              type="number"
              className="figure"
              value={xpRewardComplete}
              onChange={(e) => setXpRewardComplete(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Tiêu đề (tiếng Việt)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Phụ đề">
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </Field>
        <Field label="Mô tả">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <Field
          label="Cấu hình engine (JSON)"
          hint="Xác thực đầy đủ theo schema của engine và mô phỏng 3 lượt chỉ chạy khi xuất bản"
          error={configSyntaxError}
        >
          <Textarea
            className="min-h-[280px] font-mono text-xs"
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={checkSyntax}>
            Kiểm tra cú pháp JSON
          </Button>
        </div>

        {saveError && (
          <Alert tone="critical" title="Không lưu được cấu hình">
            {saveError.message}
            {Object.entries(saveError.fieldErrors("")).map(([path, message]) => (
              <p key={path} className="mt-1 text-xs">
                {path}: {message}
              </p>
            ))}
          </Alert>
        )}

        {publishError && (
          <Alert tone="critical" title="Xuất bản thất bại">
            {publishError.ruleCode === "CHECKLIST_REQUIRED"
              ? "Xác nhận danh sách kiểm tra trước khi xuất bản."
              : publishError.ruleCode === "INVALID_SIM_CONFIG"
                ? "Cấu hình không hợp lệ theo schema của engine."
                : publishError.message}
            {publishDetails
              .filter((d) => d.path)
              .map((d) => (
                <p key={d.path} className="mt-1 text-xs">
                  {d.path}: {d.message}
                </p>
              ))}
          </Alert>
        )}

        {removeError && (
          <Alert tone="critical" title="Không thể xóa">
            {removeError.message}
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={save.isPending}>
            Lưu cấu hình
          </Button>

          {sim.status === "DRAFT" && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checklistConfirmed}
                  onChange={(e) => setChecklistConfirmed(e.target.checked)}
                />
                Đã kiểm tra danh sách trước khi xuất bản
              </label>
              <Button
                onClick={() => publish.mutate()}
                loading={publish.isPending}
                disabled={publish.isPending || !checklistConfirmed}
              >
                Xác thực và xuất bản
              </Button>
              <Button
                variant="danger"
                onClick={() => removeMutation.mutate()}
                loading={removeMutation.isPending}
                disabled={removeMutation.isPending}
              >
                Xóa bản nháp
              </Button>
            </div>
          )}

          {sim.status === "PUBLISHED" && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => lifecycle.mutate("unpublish")}
                loading={lifecycle.isPending}
                disabled={lifecycle.isPending}
              >
                Chuyển về bản nháp
              </Button>
              <Button
                variant="danger"
                onClick={() => lifecycle.mutate("archive")}
                loading={lifecycle.isPending}
                disabled={lifecycle.isPending}
              >
                Lưu trữ
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default function AdminSimsPage() {
  const [status, setStatus] = React.useState<Status | "">("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const list = useQuery({
    queryKey: ["admin-sims", status],
    queryFn: () => api.get<AdminSim[]>("/admin/sims", { status: status || undefined, limit: 100 }),
  });

  const detail = useQuery({
    queryKey: ["admin-sim", selectedId],
    queryFn: () => api.get<AdminSim>(`/admin/sims/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionTitle>Mô phỏng</SectionTitle>
          <p className="text-sm text-ink-soft">
            Chỉnh cấu hình engine. Việc xác thực schema và mô phỏng thử 3 lượt chạy tự động khi bấm
            xuất bản.
          </p>
        </div>
        <label className="text-sm">
          <span className="ledger-label mb-1 block">Trạng thái</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
            <option value="">Tất cả</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="PUBLISHED">Đã xuất bản</option>
            <option value="ARCHIVED">Đã lưu trữ</option>
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
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title="Chưa có mô phỏng nào" description="Tạo mô phỏng qua công cụ nhập nội dung (doc 03 §14.2)." />
      ) : (
        <Card>
          <CardBody>
            <LedgerTable
              headers={["Slug", "Loại", "Trạng thái", "Phiên bản cấu hình", ""]}
              align={["left", "left", "left", "right", "left"]}
              rows={list.data.map((sim) => [
                <span key="slug" className="figure">{sim.slug}</span>,
                sim.type,
                <Chip key="status" tone={STATUS_TONE[sim.status]}>{STATUS_LABEL[sim.status]}</Chip>,
                sim.configVersion,
                <Button key="edit" size="sm" variant="secondary" onClick={() => setSelectedId(sim.id)}>
                  Sửa cấu hình
                </Button>,
              ])}
            />
          </CardBody>
        </Card>
      )}

      {selectedId && (
        <div>
          {detail.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : detail.isError ? (
            <ErrorPanel error={detail.error} onRetry={() => detail.refetch()} />
          ) : detail.data ? (
            <SimEditor sim={detail.data} onDone={() => setSelectedId(null)} />
          ) : null}
        </div>
      )}
    </div>
  );
}
