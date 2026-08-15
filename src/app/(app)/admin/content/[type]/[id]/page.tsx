"use client";

/**
 * Content editor (doc 10 scope): tracks, courses and lessons, matching the
 * admin schemas in src/server/services/adminContentService.ts and doc 03
 * §14.1. Optimistic concurrency via If-Match/etag, publish requires the
 * mentor checklist confirmation for lessons, Zod field errors surface
 * path by path.
 */

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
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
  SectionTitle,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { formatDate } from "@/lib/format";

type ContentType = "tracks" | "courses" | "lessons" | "articles";
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
const TYPE_TITLE: Record<ContentType, string> = {
  tracks: "chủ đề",
  courses: "khóa học",
  lessons: "bài học",
  articles: "bài viết",
};
const REQUIRES_CHECKLIST: Record<ContentType, boolean> = {
  tracks: false,
  courses: false,
  lessons: true,
  articles: true,
};

interface AdminRecord {
  id: string;
  slug: string;
  order: number;
  status: Status;
  etag: string;
  updatedAt: string;
  iconKey?: string | null;
  trackId?: string;
  level?: number;
  estimatedMinutes?: number;
  coverImageUrl?: string | null;
  xpReward?: number;
  finalQuizId?: string | null;
  courseId?: string;
  moduleId?: string | null;
  checkQuizId?: string | null;
  category?: string;
  readMinutes?: number;
  authorName?: string;
  relatedCourseId?: string | null;
  i18n: Record<
    string,
    {
      title?: string;
      subtitle?: string;
      description?: string;
      summary?: string;
      seoTitle?: string;
      seoDescription?: string;
      learningObjectives?: string[];
      blocks?: unknown[];
    }
  >;
}

function isContentType(v: string): v is ContentType {
  return v === "tracks" || v === "courses" || v === "lessons" || v === "articles";
}

export default function AdminContentEditorPage() {
  const params = useParams<{ type: string; id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const type = params.type;
  const id = params.id;
  const isNew = id === "new";

  const [form, setForm] = React.useState<{
    slug: string;
    order: string;
    iconKey: string;
    trackId: string;
    level: string;
    estimatedMinutes: string;
    coverImageUrl: string;
    xpReward: string;
    finalQuizId: string;
    courseId: string;
    moduleId: string;
    checkQuizId: string;
    title: string;
    subtitle: string;
    description: string;
    summary: string;
    learningObjectives: string;
    blocks: string;
    category: string;
    readMinutes: string;
    authorName: string;
    relatedCourseId: string;
    seoTitle: string;
    seoDescription: string;
  } | null>(null);
  const [checklistConfirmed, setChecklistConfirmed] = React.useState(false);
  const [staleNotice, setStaleNotice] = React.useState(false);

  const query = useQuery({
    queryKey: ["admin-content-item", type, id],
    queryFn: () => api.get<AdminRecord>(`/admin/${type}/${id}`),
    enabled: !isNew && isContentType(type),
  });

  React.useEffect(() => {
    if (!query.data) return;
    const vi = query.data.i18n.vi ?? {};
    setForm({
      slug: query.data.slug,
      order: String(query.data.order ?? 0),
      iconKey: query.data.iconKey ?? "",
      trackId: query.data.trackId ?? "",
      level: String(query.data.level ?? 1),
      estimatedMinutes: String(query.data.estimatedMinutes ?? 30),
      coverImageUrl: query.data.coverImageUrl ?? "",
      xpReward: String(query.data.xpReward ?? 50),
      finalQuizId: query.data.finalQuizId ?? "",
      courseId: query.data.courseId ?? "",
      moduleId: query.data.moduleId ?? "",
      checkQuizId: query.data.checkQuizId ?? "",
      title: vi.title ?? "",
      subtitle: vi.subtitle ?? "",
      description: vi.description ?? "",
      summary: vi.summary ?? "",
      learningObjectives: (vi.learningObjectives ?? []).join("\n"),
      blocks: JSON.stringify(vi.blocks ?? [], null, 2),
      category: query.data.category ?? "GUIDE",
      readMinutes: String(query.data.readMinutes ?? 4),
      authorName: query.data.authorName ?? "MoneyLab",
      relatedCourseId: query.data.relatedCourseId ?? "",
      seoTitle: vi.seoTitle ?? "",
      seoDescription: vi.seoDescription ?? "",
    });
  }, [query.data]);

  React.useEffect(() => {
    if (isNew) {
      setForm({
        slug: "",
        order: "0",
        iconKey: "",
        trackId: "",
        level: "1",
        estimatedMinutes: "30",
        coverImageUrl: "",
        xpReward: "50",
        finalQuizId: "",
        courseId: "",
        moduleId: "",
        checkQuizId: "",
        title: "",
        subtitle: "",
        description: "",
        summary: "",
        learningObjectives: "",
        blocks: "[]",
        category: "GUIDE",
        readMinutes: "4",
        authorName: "MoneyLab",
        relatedCourseId: "",
        seoTitle: "",
        seoDescription: "",
      });
    }
  }, [isNew]);

  function buildBody(): Record<string, unknown> {
    if (!form) return {};
    const i18nVi: Record<string, unknown> = { title: form.title, subtitle: form.subtitle, description: form.description };
    if (type === "courses") {
      i18nVi.learningObjectives = form.learningObjectives.split("\n").map((s) => s.trim()).filter(Boolean);
    }
    if (type === "lessons" || type === "articles") {
      i18nVi.summary = form.summary;
      let blocks: unknown[] = [];
      try {
        const parsed = JSON.parse(form.blocks || "[]");
        blocks = Array.isArray(parsed) ? parsed : [];
      } catch {
        blocks = [];
      }
      i18nVi.blocks = blocks;
    }
    const body: Record<string, unknown> = {
      slug: form.slug,
      order: Number(form.order) || 0,
      i18n: { vi: i18nVi },
    };
    if (type === "tracks") {
      body.iconKey = form.iconKey || undefined;
    }
    if (type === "courses") {
      body.trackId = form.trackId;
      body.level = Number(form.level) || 1;
      body.estimatedMinutes = Number(form.estimatedMinutes) || 1;
      body.coverImageUrl = form.coverImageUrl || null;
      body.xpReward = Number(form.xpReward) || 0;
      body.finalQuizId = form.finalQuizId || null;
    }
    if (type === "articles") {
      body.category = form.category;
      body.readMinutes = Number(form.readMinutes) || 4;
      body.authorName = form.authorName || "MoneyLab";
      body.coverImageUrl = form.coverImageUrl || null;
      body.relatedCourseId = form.relatedCourseId || null;
      i18nVi.seoTitle = form.seoTitle;
      i18nVi.seoDescription = form.seoDescription;
    }
    if (type === "lessons") {
      body.courseId = form.courseId;
      body.moduleId = form.moduleId || null;
      body.estimatedMinutes = Number(form.estimatedMinutes) || 1;
      body.xpReward = Number(form.xpReward) || 0;
      body.checkQuizId = form.checkQuizId || null;
    }
    return body;
  }

  let blocksJsonError = "";
  if (form && (type === "lessons" || type === "articles")) {
    try {
      JSON.parse(form.blocks || "[]");
    } catch {
      blocksJsonError = "Nội dung JSON của blocks không hợp lệ.";
    }
  }

  const create = useMutation({
    mutationFn: () => api.post<AdminRecord>(`/admin/${type}`, buildBody()),
    onSuccess: (rec) => {
      void qc.invalidateQueries({ queryKey: ["admin-content"] });
      router.replace(`/admin/content/${type}/${rec.id}`);
    },
  });

  const save = useMutation({
    mutationFn: () => api.patch<AdminRecord>(`/admin/${type}/${id}`, buildBody(), { ifMatch: query.data?.etag }),
    onSuccess: (rec) => {
      void qc.invalidateQueries({ queryKey: ["admin-content"] });
      qc.setQueryData(["admin-content-item", type, id], rec);
      setStaleNotice(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.status === 409 || err.code === "VERSION_CONFLICT")) {
        setStaleNotice(true);
      }
    },
  });

  const lifecycle = useMutation({
    mutationFn: (action: "publish" | "unpublish" | "archive") =>
      api.post<AdminRecord>(`/admin/${type}/${id}/${action}`, action === "publish" ? { checklistConfirmed } : {}),
    onSuccess: (rec) => {
      void qc.invalidateQueries({ queryKey: ["admin-content"] });
      qc.setQueryData(["admin-content-item", type, id], rec);
      setChecklistConfirmed(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.status === 409 || err.code === "VERSION_CONFLICT")) {
        setStaleNotice(true);
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => api.del(`/admin/${type}/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-content"] });
      router.push(`/admin/content`);
    },
  });

  if (!isContentType(type)) {
    return <ErrorPanel error={new Error("Loại nội dung không hợp lệ.")} />;
  }

  if (!isNew && query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => query.refetch()} />;
  }

  if (!isNew && !query.data) {
    return <EmptyState title="Không tìm thấy nội dung" description="Bản ghi có thể đã bị xóa." />;
  }

  if (!form) return null;

  const activeMutation = isNew ? create : save;
  const activeError = activeMutation.error instanceof ApiError ? activeMutation.error : null;
  const fieldErrors = activeError ? activeError.fieldErrors("") : {};
  const lifecycleError = lifecycle.error instanceof ApiError ? lifecycle.error : null;
  const removeError = removeMutation.error instanceof ApiError ? removeMutation.error : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle
            action={
              !isNew && query.data ? (
                <Chip tone={STATUS_TONE[query.data.status]}>{STATUS_LABEL[query.data.status]}</Chip>
              ) : undefined
            }
          >
            {isNew ? `Tạo ${TYPE_TITLE[type]} mới` : `Sửa ${TYPE_TITLE[type]}`}
          </SectionTitle>
          {!isNew && query.data && (
            <p className="text-xs text-ink-faint">Cập nhật lần cuối {formatDate(query.data.updatedAt)}</p>
          )}
        </div>
      </div>

      {staleNotice && (
        <Alert tone="warning" title="Nội dung đã thay đổi">
          Bản ghi này đã được người khác cập nhật kể từ khi bạn tải trang. Tải lại để lấy phiên bản
          mới nhất trước khi lưu tiếp.
          <div className="mt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setStaleNotice(false);
                void query.refetch();
              }}
            >
              Tải lại
            </Button>
          </div>
        </Alert>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" error={fieldErrors.slug}>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </Field>
            {type !== "articles" && (
              <Field label="Thứ tự" error={fieldErrors.order}>
                <Input
                  type="number"
                  className="figure"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: e.target.value })}
                />
              </Field>
            )}
          </div>

          {type === "tracks" && (
            <Field label="Icon key" hint="Khóa icon dùng trong giao diện học sinh" error={fieldErrors.iconKey}>
              <Input value={form.iconKey} onChange={(e) => setForm({ ...form, iconKey: e.target.value })} />
            </Field>
          )}

          {type === "courses" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID chủ đề (trackId)" error={fieldErrors.trackId}>
                <Input value={form.trackId} onChange={(e) => setForm({ ...form, trackId: e.target.value })} />
              </Field>
              <Field label="Cấp độ (1-3)" error={fieldErrors.level}>
                <Input
                  type="number"
                  className="figure"
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                />
              </Field>
              <Field label="Thời lượng ước tính (phút)" error={fieldErrors.estimatedMinutes}>
                <Input
                  type="number"
                  className="figure"
                  value={form.estimatedMinutes}
                  onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
                />
              </Field>
              <Field label="XP thưởng" error={fieldErrors.xpReward}>
                <Input
                  type="number"
                  className="figure"
                  value={form.xpReward}
                  onChange={(e) => setForm({ ...form, xpReward: e.target.value })}
                />
              </Field>
              <Field label="Ảnh bìa (URL)" error={fieldErrors.coverImageUrl}>
                <Input value={form.coverImageUrl} onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })} />
              </Field>
              <Field label="ID bài kiểm tra cuối khóa" hint="Để trống nếu chưa có" error={fieldErrors.finalQuizId}>
                <Input value={form.finalQuizId} onChange={(e) => setForm({ ...form, finalQuizId: e.target.value })} />
              </Field>
            </div>
          )}

          {type === "lessons" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID khóa học (courseId)" error={fieldErrors.courseId}>
                <Input value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} />
              </Field>
              <Field label="ID mô-đun (moduleId)" hint="Để trống nếu bài học không thuộc mô-đun" error={fieldErrors.moduleId}>
                <Input value={form.moduleId} onChange={(e) => setForm({ ...form, moduleId: e.target.value })} />
              </Field>
              <Field label="Thời lượng ước tính (phút)" error={fieldErrors.estimatedMinutes}>
                <Input
                  type="number"
                  className="figure"
                  value={form.estimatedMinutes}
                  onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
                />
              </Field>
              <Field label="XP thưởng" error={fieldErrors.xpReward}>
                <Input
                  type="number"
                  className="figure"
                  value={form.xpReward}
                  onChange={(e) => setForm({ ...form, xpReward: e.target.value })}
                />
              </Field>
              <Field label="ID bài kiểm tra sau bài (checkQuizId)" error={fieldErrors.checkQuizId}>
                <Input value={form.checkQuizId} onChange={(e) => setForm({ ...form, checkQuizId: e.target.value })} />
              </Field>
            </div>
          )}

          {type === "articles" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Chuyên mục" error={fieldErrors.category}>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="GUIDE">Hướng dẫn</option>
                  <option value="EXPLAINER">Giải thích</option>
                  <option value="NEWS">Tin tức</option>
                  <option value="STORY">Câu chuyện</option>
                </Select>
              </Field>
              <Field label="Thời gian đọc (phút)" error={fieldErrors.readMinutes}>
                <Input
                  type="number"
                  className="figure"
                  value={form.readMinutes}
                  onChange={(e) => setForm({ ...form, readMinutes: e.target.value })}
                />
              </Field>
              <Field label="Tác giả" error={fieldErrors.authorName}>
                <Input value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />
              </Field>
              <Field label="Ảnh bìa (URL)" error={fieldErrors.coverImageUrl}>
                <Input value={form.coverImageUrl} onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })} />
              </Field>
              <Field
                label="ID khóa học liên quan"
                hint="Để trống nếu bài viết đứng độc lập"
                error={fieldErrors.relatedCourseId}
              >
                <Input
                  value={form.relatedCourseId}
                  onChange={(e) => setForm({ ...form, relatedCourseId: e.target.value })}
                />
              </Field>
              <Field label="SEO title" hint="Tối đa 70 ký tự" error={fieldErrors["i18n.vi.seoTitle"]}>
                <Input value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} />
              </Field>
              <Field label="SEO description" hint="Tối đa 160 ký tự" error={fieldErrors["i18n.vi.seoDescription"]}>
                <Input
                  value={form.seoDescription}
                  onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                />
              </Field>
            </div>
          )}

          <Field label="Tiêu đề (tiếng Việt)" error={fieldErrors["i18n.vi.title"]}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Phụ đề" error={fieldErrors["i18n.vi.subtitle"]}>
            <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          </Field>
          <Field label="Mô tả" error={fieldErrors["i18n.vi.description"]}>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>

          {type === "courses" && (
            <Field
              label="Mục tiêu học tập"
              hint="Mỗi dòng một mục tiêu"
              error={fieldErrors["i18n.vi.learningObjectives"]}
            >
              <Textarea
                value={form.learningObjectives}
                onChange={(e) => setForm({ ...form, learningObjectives: e.target.value })}
              />
            </Field>
          )}

          {(type === "lessons" || type === "articles") && (
            <>
              <Field label="Tóm tắt" error={fieldErrors["i18n.vi.summary"]}>
                <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
              </Field>
              <Field
                label="Nội dung (blocks, JSON)"
                hint="Mảng các khối nội dung theo doc 05 §3"
                error={blocksJsonError || fieldErrors["i18n.vi.blocks"]}
              >
                <Textarea
                  className="min-h-[240px] font-mono text-xs"
                  value={form.blocks}
                  onChange={(e) => setForm({ ...form, blocks: e.target.value })}
                />
              </Field>
            </>
          )}

          {activeError && !Object.keys(fieldErrors).length && (
            <Alert tone="critical" title="Không lưu được">
              {activeError.message}
            </Alert>
          )}

          <div className="flex justify-end gap-2 border-t border-rule pt-4">
            <Button
              onClick={() => activeMutation.mutate()}
              loading={activeMutation.isPending}
              disabled={activeMutation.isPending || Boolean(blocksJsonError)}
            >
              {isNew ? "Tạo bản nháp" : "Lưu thay đổi"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {!isNew && query.data && (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle>Xuất bản và vòng đời</SectionTitle>

            {lifecycleError && (
              <Alert tone="critical" title="Thao tác thất bại">
                {lifecycleError.ruleCode === "CHECKLIST_REQUIRED"
                  ? "Xác nhận danh sách kiểm tra nội dung trước khi xuất bản."
                  : lifecycleError.message}
                {lifecycleError.details
                  .filter((d) => d.path && d.path !== "")
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

            {query.data.status === "DRAFT" && (
              <div className="space-y-2">
                {REQUIRES_CHECKLIST[type] && (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checklistConfirmed}
                      onChange={(e) => setChecklistConfirmed(e.target.checked)}
                    />
                    <span>
                      Tôi đã kiểm tra nội dung theo danh sách kiểm tra của người hướng dẫn (chính tả,
                      số liệu, bài kiểm tra đi kèm) và xác nhận sẵn sàng xuất bản.
                    </span>
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => lifecycle.mutate("publish")}
                    loading={lifecycle.isPending}
                    disabled={lifecycle.isPending || (REQUIRES_CHECKLIST[type] && !checklistConfirmed)}
                  >
                    Xuất bản
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
              </div>
            )}

            {query.data.status === "PUBLISHED" && (
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

            {query.data.status === "ARCHIVED" && (
              <p className="text-sm text-ink-soft">Nội dung đã lưu trữ. Không thể chỉnh sửa vòng đời thêm.</p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
