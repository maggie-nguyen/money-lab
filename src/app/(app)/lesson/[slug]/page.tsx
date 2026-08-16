/**
 * Lesson reader, doc 03 §3.4 + §4.3-4.5.
 *
 * The lesson reads as one continuous page rather than a slideshow: the opening
 * video is hoisted into a hero player, the blocks flow beneath it, and progress
 * is tracked from what the learner has actually scrolled past. `lastBlockIndex`
 * keeps its meaning, so /lessons/{id}/start still resumes where they stopped.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, idempotencyKey } from "@/lib/api";
import type { AttemptState, Awards, Block, LessonDetail } from "@/lib/types";
import { formatMinutes } from "@/lib/format";
import { BOOTSTRAP_KEY, useT, useToast } from "@/components/Providers";
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  ProgressBar,
  Skeleton,
  cx,
} from "@/components/ui";
import { LessonBlock } from "@/components/lesson/Blocks";

interface CompleteResponse {
  progress: { status: string; lastBlockIndex: number };
  courseCompleted: boolean;
  /** Only the code and issue date come back here, the full record lives on /me/certificates. */
  certificate: { code: string; issuedAt: string } | null;
  awards: Awards;
}

/** Progress is saved on a timer rather than on every block that scrolls by. */
const SAVE_DEBOUNCE_MS = 1500;

export default function LessonPlayerPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();

  const lessonQuery = useQuery({
    queryKey: ["lesson", slug],
    queryFn: () => api.get<LessonDetail>(`/catalog/lessons/${slug}`),
  });

  const [seen, setSeen] = React.useState(0);
  const startedFor = React.useRef<string | null>(null);
  const resumedTo = React.useRef<number | null>(null);
  const [completeResult, setCompleteResult] = React.useState<CompleteResponse | null>(null);
  const blockRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  /** Highest index already persisted, so the debounce never resends it. */
  const saved = React.useRef(0);

  const lesson = lessonQuery.data;

  // The first block, when it is a video, becomes the hero and leaves the flow.
  const heroVideo: Block | null =
    lesson && lesson.blocks[0]?.type === "VIDEO" ? (lesson.blocks[0] as Block) : null;
  const bodyBlocks: Block[] = lesson ? (heroVideo ? lesson.blocks.slice(1) : lesson.blocks) : [];
  const offset = heroVideo ? 1 : 0;
  const total = lesson?.blocks.length ?? 0;

  const start = useMutation({
    mutationFn: async (lessonId: string) =>
      api.post<{ status: string; lastBlockIndex: number }>(`/lessons/${lessonId}/start`),
    onSuccess: (res) => {
      setSeen((prev) => Math.max(prev, res.lastBlockIndex));
      // Already on the server, so the debounced save has nothing to send yet.
      saved.current = Math.max(saved.current, res.lastBlockIndex);
      resumedTo.current = res.lastBlockIndex;
    },
    onError: () => {
      resumedTo.current = 0;
    },
  });

  React.useEffect(() => {
    if (!lesson || startedFor.current === lesson.id) return;
    startedFor.current = lesson.id;
    start.mutate(lesson.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson]);

  // Coming back to a half-read lesson should land on the paragraph they left,
  // not at the top. Runs once, after the blocks are on the page.
  React.useEffect(() => {
    const target = resumedTo.current;
    if (!lesson || target === null || target <= 0) return;
    resumedTo.current = null;
    const el = blockRefs.current[target - offset];
    el?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, seen]);

  // Furthest block scrolled into view, which is what lastBlockIndex means here.
  React.useEffect(() => {
    if (!lesson) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let highest = -1;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = Number((entry.target as HTMLElement).dataset.blockIndex);
          if (Number.isFinite(i) && i > highest) highest = i;
        }
        if (highest >= 0) setSeen((prev) => (highest > prev ? highest : prev));
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    for (const el of blockRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [lesson, bodyBlocks.length]);

  const saveProgress = useMutation({
    mutationFn: async ({ lessonId, lastBlockIndex }: { lessonId: string; lastBlockIndex: number }) =>
      api.patch(`/lessons/${lessonId}/progress`, { lastBlockIndex }),
  });

  React.useEffect(() => {
    if (!lesson || seen <= saved.current) return;
    const timer = setTimeout(() => {
      saved.current = seen;
      saveProgress.mutate({ lessonId: lesson.id, lastBlockIndex: seen });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, lesson]);

  const complete = useMutation({
    mutationFn: async (lessonId: string) =>
      api.post<CompleteResponse>(`/lessons/${lessonId}/complete`, undefined, {
        idempotencyKey: idempotencyKey("lesson-complete", lessonId),
      }),
    onSuccess: async (res) => {
      setCompleteResult(res);
      await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      toast({ tone: "positive", message: t("lesson.completeToast") });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError && err.ruleCode === "CHECK_QUIZ_NOT_PASSED"
          ? t("lesson.needCheckQuiz")
          : err instanceof ApiError
            ? err.message
            : t("lesson.completeFailed");
      toast({ tone: "critical", message });
    },
  });

  const startCheckQuiz = useMutation({
    mutationFn: async (quizId: string) => api.post<AttemptState>(`/quizzes/${quizId}/attempts`),
    onSuccess: (attempt) => {
      const qs = new URLSearchParams({ quizId: attempt.quizId });
      if (lesson?.checkQuiz) qs.set("pass", String(lesson.checkQuiz.passThresholdPct));
      qs.set("back", `/lesson/${slug}`);
      router.push(`/quiz/${attempt.id}?${qs.toString()}`);
    },
    onError: (err, quizId) => {
      if (err instanceof ApiError && err.status === 409) {
        const existingId = err.details[0]?.message;
        if (existingId) {
          const qs = new URLSearchParams({ quizId });
          if (lesson?.checkQuiz) qs.set("pass", String(lesson.checkQuiz.passThresholdPct));
          qs.set("back", `/lesson/${slug}`);
          router.push(`/quiz/${existingId}?${qs.toString()}`);
          return;
        }
      }
      toast({
        tone: "critical",
        message: err instanceof ApiError ? err.message : t("lesson.quizStartFailed"),
      });
    },
  });

  if (lessonQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (lessonQuery.isError) {
    return <ErrorPanel error={lessonQuery.error} onRetry={() => lessonQuery.refetch()} />;
  }

  if (!lesson) {
    return <EmptyState title={t("lesson.notFound")} />;
  }

  if (lesson.blocks.length === 0) {
    return <EmptyState title={t("lesson.emptyTitle")} description={t("lesson.emptyDescription")} />;
  }

  // The outline is built from the headings, which is the only structure an
  // author reliably gives us.
  const outline = bodyBlocks
    .map((b, i) => (b.type === "HEADING" ? { index: i, text: b.text } : null))
    .filter((x): x is { index: number; text: string } => x !== null);

  return (
    <div className="pb-24">
      {heroVideo && (
        <div className="mb-6 overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink">
          <LessonBlock block={heroVideo} lessonSlug={lesson.slug} />
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <article className="min-w-0">
          <LedgerLabel>
            <Link href={`/course/${lesson.courseSlug}`} className="hover:underline">
              {lesson.courseTitle}
            </Link>
          </LedgerLabel>
          <h1 className="mt-2 font-display text-3xl font-semibold">{lesson.title}</h1>
          <p className="figure mt-2 text-sm text-ink-faint">
            {t("lesson.meta", {
              position: lesson.position,
              total: lesson.lessonCount,
              minutes: formatMinutes(lesson.estimatedMinutes),
              xp: lesson.xpReward,
            })}
          </p>
          {lesson.summary && <p className="mt-4 text-lg leading-relaxed text-ink-soft">{lesson.summary}</p>}

          <div className="mt-8 space-y-6">
            {bodyBlocks.map((block, i) => (
              <div
                key={i}
                id={`block-${i}`}
                data-block-index={i + offset}
                ref={(el) => {
                  blockRefs.current[i] = el;
                }}
                className="scroll-mt-24"
              >
                <LessonBlock block={block} lessonSlug={lesson.slug} />
              </div>
            ))}
          </div>

          <Card tone={completeResult ? "ink" : "flat"} className="mt-10">
            <CardBody className="space-y-4">
              {!completeResult ? (
                <>
                  <div>
                    <p className="font-display text-lg font-semibold">{t("lesson.completeTitle")}</p>
                    <p className="figure mt-1 text-sm text-ink-faint">
                      {t("lesson.xpOnComplete", { xp: lesson.xpReward })}
                    </p>
                  </div>
                  {lesson.checkQuiz && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-rule px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{t("lesson.checkQuizTitle")}</p>
                        <p className="figure text-xs text-ink-faint">
                          {t("lesson.checkQuizMeta", {
                            count: lesson.checkQuiz.questionCount,
                            pct: lesson.checkQuiz.passThresholdPct,
                          })}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={startCheckQuiz.isPending}
                        onClick={() => startCheckQuiz.mutate(lesson.checkQuiz!.id)}
                      >
                        {t("lesson.takeCheckQuiz")}
                      </Button>
                    </div>
                  )}
                  {complete.isError && <ErrorPanel error={complete.error} />}
                  <Button onClick={() => complete.mutate(lesson.id)} loading={complete.isPending} className="w-full">
                    {t("lesson.completeTitle")}
                  </Button>
                </>
              ) : (
                <>
                  <p className="font-display text-lg font-semibold">{t("lesson.congrats")}</p>
                  <div className="figure flex flex-wrap gap-4 text-sm">
                    <span>+{completeResult.awards.xp} XP</span>
                    <span>{t("lesson.awardedCoins", { count: completeResult.awards.coins })}</span>
                    {completeResult.awards.levelUp && (
                      <span>{t("lesson.levelUp", { level: completeResult.awards.levelUp.to })}</span>
                    )}
                  </div>
                  {completeResult.awards.badges.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {completeResult.awards.badges.map((b) => (
                        <span key={b.code} className="rounded-full border border-paper/40 px-3 py-1 text-xs">
                          {b.title}
                        </span>
                      ))}
                    </div>
                  )}
                  {completeResult.courseCompleted && (
                    <Alert tone="positive" title={t("lesson.courseDoneTitle")}>
                      {t("lesson.courseDoneBody")}
                      {completeResult.certificate && t("lesson.certificateNote")}
                    </Alert>
                  )}
                  <Link href={lesson.next ? `/lesson/${lesson.next.slug}` : `/course/${lesson.courseSlug}`}>
                    <Button variant="secondary" className="w-full border-paper/40 text-paper hover:bg-paper/10">
                      {lesson.next
                        ? t("lesson.next", { title: lesson.next.title })
                        : t("lesson.backToCourse")}
                    </Button>
                  </Link>
                </>
              )}
            </CardBody>
          </Card>
        </article>

        <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          <div className="space-y-4">
            <div>
              <LedgerLabel>{t("lesson.sidebarProgress")}</LedgerLabel>
              <div className="mt-2">
                <ProgressBar
                  value={Math.min(seen + 1, total)}
                  max={total}
                  label={t("lesson.progressLabel")}
                />
              </div>
              <p className="figure mt-1 text-xs text-ink-faint">
                {t("lesson.partsProgress", { done: Math.min(seen + 1, total), total })}
              </p>
            </div>
            {outline.length > 0 && (
              <nav aria-label={t("lesson.outline")}>
                <LedgerLabel>{t("lesson.sidebarContents")}</LedgerLabel>
                <ul className="mt-2 space-y-1.5 border-l border-rule">
                  {outline.map((h) => (
                    <li key={h.index}>
                      <a
                        href={`#block-${h.index}`}
                        className={cx(
                          "-ml-px block border-l-2 py-0.5 pl-3 text-sm",
                          seen >= h.index + offset
                            ? "border-moss-400 text-ink"
                            : "border-transparent text-ink-soft hover:text-ink",
                        )}
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </aside>
      </div>

      {/* Sits above the mobile tab bar, which owns the very bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-[2.9rem] z-20 border-t border-rule bg-paper/95 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          {lesson.prev ? (
            <Link href={`/lesson/${lesson.prev.slug}`} className="shrink-0">
              <Button variant="secondary" size="sm">
                {t("lesson.prev")}
              </Button>
            </Link>
          ) : (
            <Link href={`/course/${lesson.courseSlug}`} className="shrink-0">
              <Button variant="secondary" size="sm">
                {t("lesson.courseShort")}
              </Button>
            </Link>
          )}
          <span className="figure hidden flex-1 text-center text-xs text-ink-faint sm:block">
            {t("lesson.positionShort", { position: lesson.position, total: lesson.lessonCount })}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!completeResult && (
              <Button size="sm" onClick={() => complete.mutate(lesson.id)} loading={complete.isPending}>
                {t("lesson.completeShort")}
              </Button>
            )}
            {lesson.next && (
              <Link href={`/lesson/${lesson.next.slug}`}>
                <Button size="sm" variant={completeResult ? "primary" : "secondary"}>
                  {t("lesson.nextBar")}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
