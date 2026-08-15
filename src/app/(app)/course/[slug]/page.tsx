/**
 * Course landing, doc 03 §3.3 (`GET /catalog/courses/{idOrSlug}` → CourseDetail).
 *
 * Reads as a course page rather than a directory listing: cover banner, one
 * primary action that knows where the learner left off, objectives as cards,
 * then a numbered syllabus where every row says what it is made of.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { AttemptState, CourseDetail, LessonSummary } from "@/lib/types";
import { formatMinutes } from "@/lib/format";
import { coverStyle } from "@/lib/cover";
import { CoverArt } from "@/components/art/CoverArt";
import { useToast } from "@/components/Providers";
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  ProgressBar,
  SectionTitle,
  Skeleton,
} from "@/components/ui";

function levelLabel(level: 1 | 2 | 3): string {
  return level === 1 ? "Cơ bản" : level === 2 ? "Trung cấp" : "Nâng cao";
}

/** What the lesson is made of, from LessonSummary.media and hasCheckQuiz. */
function MediaGlyphs({ lesson }: { lesson: LessonSummary }) {
  const marks: Array<{ key: string; label: string; title: string }> = [];
  if (lesson.media.video) marks.push({ key: "v", label: "Video", title: "Có video" });
  if (lesson.media.sim) marks.push({ key: "s", label: "Mô phỏng", title: "Có hoạt động mô phỏng" });
  if (lesson.hasCheckQuiz) marks.push({ key: "q", label: "Kiểm tra", title: "Có bài kiểm tra nhanh" });
  if (marks.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {marks.map((m) => (
        <span
          key={m.key}
          title={m.title}
          className="ledger-label rounded-full border border-rule px-2 py-0.5 text-[0.65rem] text-ink-faint"
        >
          {m.label}
        </span>
      ))}
    </span>
  );
}

function LessonRow({ lesson, number }: { lesson: LessonSummary; number: number }) {
  const status = lesson.progress?.status;
  return (
    <Link
      href={`/lesson/${lesson.slug}`}
      className="flex items-start gap-4 border-b border-rule px-1 py-4 last:border-b-0 hover:bg-paper-sunken"
    >
      <span
        className={
          status === "COMPLETED"
            ? "figure mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-moss-50 text-sm font-semibold text-moss-600"
            : "figure mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rule text-sm text-ink-soft"
        }
        aria-hidden="true"
      >
        {status === "COMPLETED" ? "✓" : number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{lesson.title}</span>
        <span className="figure mt-1 block text-xs text-ink-faint">
          {formatMinutes(lesson.estimatedMinutes)} · {lesson.xpReward} XP
        </span>
        <span className="mt-2 block">
          <MediaGlyphs lesson={lesson} />
        </span>
      </span>
      <span className="shrink-0 self-center text-ink-faint" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const toast = useToast();

  const courseQuery = useQuery({
    queryKey: ["course", slug],
    queryFn: () => api.get<CourseDetail>(`/catalog/courses/${slug}`),
  });

  const startFinalQuiz = useMutation({
    mutationFn: async (quizId: string) => api.post<AttemptState>(`/quizzes/${quizId}/attempts`),
    onSuccess: (attempt, quizId) => {
      const course = courseQuery.data;
      const qs = new URLSearchParams({ quizId });
      if (course?.finalQuiz) qs.set("pass", String(course.finalQuiz.passThresholdPct));
      qs.set("back", `/course/${slug}`);
      router.push(`/quiz/${attempt.id}?${qs.toString()}`);
    },
    onError: (err, quizId) => {
      if (err instanceof ApiError && err.status === 409) {
        const existingId = err.details[0]?.message;
        if (existingId) {
          const course = courseQuery.data;
          const qs = new URLSearchParams({ quizId });
          if (course?.finalQuiz) qs.set("pass", String(course.finalQuiz.passThresholdPct));
          qs.set("back", `/course/${slug}`);
          router.push(`/quiz/${existingId}?${qs.toString()}`);
          return;
        }
      }
      toast({ tone: "critical", message: err instanceof ApiError ? err.message : "Không bắt đầu được bài kiểm tra." });
    },
  });

  if (courseQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (courseQuery.isError) {
    return <ErrorPanel error={courseQuery.error} onRetry={() => courseQuery.refetch()} />;
  }

  const course = courseQuery.data;
  if (!course) {
    return <EmptyState title="Không tìm thấy khóa học" />;
  }

  const completedLessons = course.progress?.completedLessons ?? 0;

  // Lessons in reading order, so the syllabus numbers and the primary action
  // agree with each other even when the course mixes modules and loose lessons.
  const ordered: LessonSummary[] = [
    ...course.modules.flatMap((m) => m.lessons),
    ...course.unmoduledLessons,
  ];
  const numberOf = new Map(ordered.map((l, i) => [l.id, i + 1]));
  const resume = ordered.find((l) => l.progress?.status !== "COMPLETED") ?? ordered[0];
  const started = ordered.some((l) => l.progress && l.progress.status !== "NOT_STARTED");
  const ctaLabel =
    course.progress?.status === "COMPLETED" ? "Xem lại" : started ? "Học tiếp" : "Bắt đầu học";

  return (
    <div className="space-y-8">
      <div
        className="relative overflow-hidden rounded-[var(--radius-card)]"
        style={course.coverImageUrl ? undefined : coverStyle(course.slug)}
      >
        {course.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <CoverArt slug={course.slug} className="absolute inset-0 h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/20" />
        <div className="relative flex min-h-[12rem] flex-col justify-end gap-3 p-5 text-white sm:min-h-[15rem] sm:p-7">
          {/* Plain spans, not Chip: the chip tones are built for paper, and on
              the banner they read as white on white. */}
          <div className="ledger-label flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/40 bg-white/15 px-2.5 py-0.5">
              {levelLabel(course.level)}
            </span>
            {course.progress?.status === "COMPLETED" && (
              <span className="rounded-full border border-white/40 bg-white/15 px-2.5 py-0.5">Hoàn thành</span>
            )}
          </div>
          <h1 className="font-display text-3xl font-semibold">{course.title}</h1>
          {course.subtitle && <p className="max-w-2xl text-white/85">{course.subtitle}</p>}
          <p className="figure text-sm text-white/75">
            {formatMinutes(course.estimatedMinutes)} · {course.lessonCount} bài học · {course.xpReward} XP
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {resume && (
          <Link href={`/lesson/${resume.slug}`}>
            <Button size="lg">{ctaLabel}</Button>
          </Link>
        )}
        {course.progress && (
          <div className="min-w-[12rem] flex-1 space-y-1">
            <ProgressBar value={completedLessons} max={course.lessonCount} label="Tiến độ khóa học" />
            <p className="figure text-xs text-ink-faint">
              {completedLessons}/{course.lessonCount} bài đã hoàn thành
            </p>
          </div>
        )}
      </div>

      {course.description && <p className="max-w-2xl leading-relaxed text-ink-soft">{course.description}</p>}

      {course.learningObjectives.length > 0 && (
        <section>
          <SectionTitle>Sau khóa học bạn sẽ</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {course.learningObjectives.map((obj, i) => (
              <Card key={i} tone="flat">
                <CardBody className="flex gap-3">
                  <span className="figure text-sm text-moss-600" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm">{obj}</span>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}

      {ordered.length === 0 ? (
        <EmptyState title="Chưa có bài học" description="Khóa học này chưa có nội dung." />
      ) : (
        <section>
          <SectionTitle>Nội dung khóa học</SectionTitle>
          <div className="space-y-6">
            {course.modules.map((mod) => (
              <div key={mod.id}>
                <LedgerLabel>{mod.title}</LedgerLabel>
                <Card tone="flat" className="mt-2">
                  <CardBody className="py-0">
                    {mod.lessons.length === 0 ? (
                      <p className="py-4 text-sm text-ink-faint">Chưa có bài học trong phần này.</p>
                    ) : (
                      mod.lessons.map((lesson) => (
                        <LessonRow key={lesson.id} lesson={lesson} number={numberOf.get(lesson.id) ?? 1} />
                      ))
                    )}
                  </CardBody>
                </Card>
              </div>
            ))}

            {course.unmoduledLessons.length > 0 && (
              <div>
                {course.modules.length > 0 && <LedgerLabel>Bài học khác</LedgerLabel>}
                <Card tone="flat" className={course.modules.length > 0 ? "mt-2" : undefined}>
                  <CardBody className="py-0">
                    {course.unmoduledLessons.map((lesson) => (
                      <LessonRow key={lesson.id} lesson={lesson} number={numberOf.get(lesson.id) ?? 1} />
                    ))}
                  </CardBody>
                </Card>
              </div>
            )}
          </div>
        </section>
      )}

      {course.finalQuiz && (
        <section>
          <SectionTitle>Kiểm tra cuối khóa</SectionTitle>
          <Card tone="ink">
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">{course.finalQuiz.questionCount} câu hỏi</p>
                <p className="figure text-sm opacity-80">Cần đạt {course.finalQuiz.passThresholdPct}% để qua</p>
              </div>
              <Button
                variant="secondary"
                className="border-paper/40 text-paper hover:bg-paper/10"
                loading={startFinalQuiz.isPending}
                onClick={() => startFinalQuiz.mutate(course.finalQuiz!.id)}
              >
                Bắt đầu kiểm tra
              </Button>
            </CardBody>
          </Card>
        </section>
      )}
    </div>
  );
}
