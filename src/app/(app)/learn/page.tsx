/**
 * The catalogue, doc 03 §2.6 (bootstrap) + §3.1-3.2 (catalog) + §12 (library).
 *
 * Courses are the point of the page, so they own the main column: a continue
 * card built on the course cover art, then every track as a shelf of cover
 * cards, then the newest articles. Stats and quests sit in a sidebar, where
 * they inform without becoming the first thing a learner reads.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ArticleSummary, CourseSummary, LessonDetail, TrackSummary } from "@/lib/types";
import { formatMinutes } from "@/lib/format";
import { coverStyle } from "@/lib/cover";
import { CoverArt } from "@/components/art/CoverArt";
import { useSession } from "@/components/Providers";
import {
  Button,
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  ProgressBar,
  SectionTitle,
  Skeleton,
  StatStrip,
} from "@/components/ui";

function levelLabel(level: 1 | 2 | 3): string {
  return level === 1 ? "Cơ bản" : level === 2 ? "Trung cấp" : "Nâng cao";
}

/**
 * Cover art. An uploaded image wins when there is one, otherwise the drawn
 * slug-keyed cover fills the frame, so nothing on this page renders grey and
 * nothing waits on a download.
 */
function Cover({
  slug,
  url,
  className,
  children,
}: {
  slug: string;
  url: string | null;
  className: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={url ? undefined : coverStyle(slug)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <CoverArt slug={slug} className="absolute inset-0 h-full w-full" />
      )}
      {children}
    </div>
  );
}

function ContinueCard() {
  const { bootstrap } = useSession();
  const cl = bootstrap?.continueLearning ?? null;

  const lessonQuery = useQuery({
    queryKey: ["lesson", cl?.lessonSlug],
    queryFn: () => api.get<LessonDetail>(`/catalog/lessons/${cl!.lessonSlug}`),
    enabled: Boolean(cl),
  });

  if (!cl) return null;
  const lesson = lessonQuery.data;

  return (
    <Link href={`/lesson/${cl.lessonSlug}`} className="block">
      <Cover
        slug={cl.lessonSlug}
        url={null}
        className="flex min-h-[13rem] items-end rounded-[var(--radius-card)] sm:min-h-[15rem]"
      >
        {/* Scrim, so the type stays readable whatever the cover turns out to be. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
        <div className="relative w-full p-5 text-white sm:p-6">
          <LedgerLabel className="text-white/70">Tiếp tục học</LedgerLabel>
          {lessonQuery.isLoading ? (
            <div className="mt-2 h-7 w-64 max-w-full animate-pulse rounded bg-white/25" />
          ) : (
            <p className="mt-1.5 font-display text-2xl font-semibold">{lesson?.title ?? "Bài học tiếp theo"}</p>
          )}
          {lesson && (
            <p className="figure mt-1 text-sm text-white/80">
              {lesson.courseTitle} · Bài {lesson.position}/{lesson.lessonCount} ·{" "}
              {formatMinutes(lesson.estimatedMinutes)}
            </p>
          )}
          <span className="mt-4 inline-flex rounded-[var(--radius-control)] bg-white px-4 py-2 text-sm font-medium text-ink">
            Học tiếp
          </span>
        </div>
      </Cover>
    </Link>
  );
}

function DailyQuestsCard() {
  const { bootstrap } = useSession();
  const quests = bootstrap?.dailyQuests ?? [];
  if (quests.length === 0) return null;

  return (
    <Card>
      <CardBody className="space-y-3">
        <LedgerLabel>Nhiệm vụ hôm nay</LedgerLabel>
        <div className="space-y-3">
          {quests.map((q) => (
            <div key={q.code} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className={q.completedAt ? "text-ink-faint line-through" : ""}>{q.title}</span>
                <span className="figure text-ink-faint">
                  {q.progressInt}/{q.targetInt}
                </span>
              </div>
              <ProgressBar value={q.progressInt} max={q.targetInt} label={q.title} />
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function CourseCard({ course }: { course: CourseSummary }) {
  const completed = course.progress?.completedLessons ?? 0;
  return (
    <Link href={`/course/${course.slug}`} className="group block">
      {/* Flex column so the meta line can sit at the bottom without the body
          overflowing the card, which the cover image would then clip. */}
      <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
        <Cover slug={course.slug} url={course.coverImageUrl} className="h-32 w-full shrink-0" />
        <CardBody className="flex flex-1 flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <Chip tone="moss">{levelLabel(course.level)}</Chip>
            {course.progress?.status === "COMPLETED" && <Chip tone="positive">Hoàn thành</Chip>}
            {course.progress?.status === "IN_PROGRESS" && <Chip tone="neutral">Đang học</Chip>}
          </div>
          <div>
            <p className="font-display text-base font-semibold group-hover:underline">{course.title}</p>
            {course.subtitle && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{course.subtitle}</p>}
          </div>
          <p className="figure mt-auto text-xs text-ink-faint">
            {formatMinutes(course.estimatedMinutes)} · {course.lessonCount} bài · {course.xpReward} XP
          </p>
          {course.progress && (
            <ProgressBar value={completed} max={course.lessonCount} label={`Tiến độ ${course.title}`} />
          )}
        </CardBody>
      </Card>
    </Link>
  );
}

function TrackSection({ track }: { track: TrackSummary }) {
  const query = useQuery({
    queryKey: ["track", track.slug],
    queryFn: () => api.get<TrackSummary & { courses: CourseSummary[] }>(`/catalog/tracks/${track.slug}`),
  });

  return (
    <section>
      <SectionTitle>{track.title}</SectionTitle>
      {track.subtitle && <p className="-mt-1 mb-3 text-sm text-ink-soft">{track.subtitle}</p>}
      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data || query.data.courses.length === 0 ? (
        <EmptyState title="Chưa có khóa học" description="Chủ đề này chưa có khóa học nào." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {query.data.courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Three newest articles, so the library is discoverable from the main path. */
function LibraryStrip() {
  const query = useQuery({
    queryKey: ["library", "latest"],
    queryFn: () => api.get<ArticleSummary[]>("/library/articles", { limit: 3 }),
  });

  if (query.isLoading || query.isError || !query.data || query.data.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>Bài viết mới</SectionTitle>
        <Link href="/library" className="text-sm text-moss-600 hover:underline">
          Xem thư viện
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {query.data.map((a) => (
          <Link key={a.id} href={`/library/${a.slug}`} className="group block">
            <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
              <Cover slug={a.slug} url={a.coverImageUrl} className="h-24 w-full" />
              <CardBody className="space-y-1.5">
                <p className="figure text-xs text-ink-faint">{a.readMinutes} phút đọc</p>
                <p className="font-medium leading-snug group-hover:underline">{a.title}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function LearnPage() {
  const { bootstrap } = useSession();
  const stats = bootstrap?.stats;

  const tracksQuery = useQuery({
    queryKey: ["tracks"],
    queryFn: () => api.get<TrackSummary[]>("/catalog/tracks"),
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Khóa học</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Mỗi bài học gồm một video ngắn, phần đọc, một hoạt động thực hành và câu hỏi kiểm tra.
          </p>
        </div>

        <ContinueCard />

        {tracksQuery.isLoading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-6 w-40" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-56 w-full" />
              ))}
            </div>
          </div>
        ) : tracksQuery.isError ? (
          <ErrorPanel error={tracksQuery.error} onRetry={() => tracksQuery.refetch()} />
        ) : !tracksQuery.data || tracksQuery.data.length === 0 ? (
          <EmptyState title="Chưa có khóa học nào" description="Nội dung sẽ sớm được cập nhật." />
        ) : (
          <div className="space-y-10">
            {tracksQuery.data.map((track) => (
              <TrackSection key={track.id} track={track} />
            ))}
          </div>
        )}

        <LibraryStrip />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {stats && (
          <StatStrip
            items={[
              { label: "XP", value: stats.xpTotal },
              { label: "Chuỗi ngày học", value: stats.streakCurrent, hint: "ngày" },
              { label: "Bài đã học", value: stats.lessonsCompleted },
              { label: "Xu", value: stats.coins },
            ]}
          />
        )}
        <DailyQuestsCard />
        <Card tone="flat">
          <CardBody className="space-y-2">
            <LedgerLabel>Luyện tập</LedgerLabel>
            <p className="text-sm text-ink-soft">
              Thử một tình huống mô phỏng hoặc tính nhanh một khoản vay.
            </p>
            <div className="flex gap-2 pt-1">
              <Link href="/sims">
                <Button size="sm" variant="secondary">
                  Mô phỏng
                </Button>
              </Link>
              <Link href="/tools">
                <Button size="sm" variant="secondary">
                  Công cụ
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
