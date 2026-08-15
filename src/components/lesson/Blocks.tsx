/**
 * Lesson block renderer. Handles every variant of the `Block` union from
 * src/lib/types.ts (that union is authoritative, see doc 10 §build brief).
 *
 * CHECK_QUESTION: the catalog GET strips answerKey from these blocks (doc 03
 * §3.4), so grading happens server side through
 * POST /catalog/lessons/:idOrSlug/check/:questionId. It is formative only:
 * nothing is stored, no XP is granted, and retries are unlimited. Without a
 * lessonSlug the block falls back to a read-only self-review rendering.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { Alert, Button, Card, CardBody, LedgerLabel, LedgerTable, cx } from "@/components/ui";
import { api } from "@/lib/api";
import type { Block } from "@/lib/types";

function isYoutube(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url);
}

/**
 * Embeds go through youtube-nocookie.com, which does not set tracking cookies
 * until the learner actually presses play. Our audience is under 18, and the CSP
 * only allows frames from that host, so a plain youtube.com url would be blocked
 * rather than silently tracked.
 */
function youtubeEmbedUrl(url: string): string {
  const short = url.match(/youtu\.be\/([\w-]+)/);
  if (short?.[1]) return `https://www.youtube-nocookie.com/embed/${short[1]}`;
  const long = url.match(/[?&]v=([\w-]+)/);
  if (long?.[1]) return `https://www.youtube-nocookie.com/embed/${long[1]}`;
  const embed = url.match(/\/embed\/([\w-]+)/);
  if (embed?.[1]) return `https://www.youtube-nocookie.com/embed/${embed[1]}`;
  return url;
}

/** Same titles as the tools index, so the block names the tool it opens. */
const TOOL_TITLE: Record<string, string> = {
  "compound-interest": "Lãi kép",
  "loan-payment": "Tính khoản trả góp",
  "loan-compare": "So sánh khoản vay",
  "savings-goal": "Mục tiêu tiết kiệm",
  inflation: "Lạm phát",
  "budget-503020": "Ngân sách 50/30/20",
};

function CalculatorBlock({ block }: { block: Extract<Block, { type: "CALCULATOR" }> }) {
  // Presets ride along as query parameters, which the tool page reads for its
  // initial field values, so the learner lands on the numbers from the lesson
  // instead of the generic defaults.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(block.presets ?? {})) qs.set(k, String(v));
  const query = qs.toString();
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <LedgerLabel>Công cụ tính toán</LedgerLabel>
          <p className="mt-1 text-sm">
            {TOOL_TITLE[block.tool]
              ? `Mở công cụ ${TOOL_TITLE[block.tool]} với số liệu của bài này.`
              : "Thử ngay công cụ liên quan đến bài học này."}
          </p>
        </div>
        <Link
          href={`/tools/${encodeURIComponent(block.tool)}${query ? `?${query}` : ""}`}
          className="text-sm font-medium text-moss-600 underline underline-offset-2"
        >
          Mở công cụ
        </Link>
      </CardBody>
    </Card>
  );
}

function CalloutBlock({ block }: { block: Extract<Block, { type: "CALLOUT" }> }) {
  const tone = block.variant === "WARNING" ? "warning" : block.variant === "TIP" ? "positive" : "info";
  return (
    <Alert tone={tone} title={block.title}>
      {block.text}
    </Alert>
  );
}

interface CheckResult {
  questionId: string;
  isCorrect: boolean;
  correctResponse: Record<string, unknown>;
  explanation: string | null;
}

/**
 * Formative check inside a lesson. The answer key stays on the server, so the
 * response is graded by POST /catalog/lessons/:slug/check/:questionId. Nothing
 * is stored and the learner may try again as often as they like.
 */
function CheckQuestionBlock({
  block,
  lessonSlug,
}: {
  block: Extract<Block, { type: "CHECK_QUESTION" }>;
  lessonSlug?: string;
}) {
  const q = block.question;
  // TRUE_FALSE carries no options, so the renderer supplies the two it implies.
  const options: Array<{ key: string; text: string }> =
    q.type === "TRUE_FALSE"
      ? [
          { key: "true", text: "Đúng" },
          { key: "false", text: "Sai" },
        ]
      : (q.options ?? []);

  const [choice, setChoice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CheckResult | null>(null);
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const answerable = Boolean(lessonSlug) && options.length > 0;

  async function submit() {
    if (!lessonSlug || !choice) return;
    setPending(true);
    setFailed(false);
    try {
      const res = await api.post<CheckResult>(
        `/catalog/lessons/${lessonSlug}/check/${q.id}`,
        { response: buildResponse(q.type, choice) },
      );
      setResult(res);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card tone="flat">
      <CardBody className="space-y-3">
        <LedgerLabel>Câu hỏi ôn tập</LedgerLabel>
        <p className="font-medium">{q.prompt}</p>

        {options.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {options.map((opt) => {
              const key = opt.key;
              const picked = choice === key;
              const correct = result?.correctResponse.correct;
              const isAnswer =
                result !== null &&
                (correct === key ||
                  // TRUE_FALSE answer keys are booleans, the option keys are strings.
                  String(correct) === key ||
                  (Array.isArray(correct) && (correct as string[]).includes(key)));
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={!answerable || pending}
                    onClick={() => {
                      setChoice(key);
                      setResult(null);
                    }}
                    aria-pressed={picked}
                    className={cx(
                      "w-full rounded-[var(--radius-control)] border px-3 py-2 text-left",
                      isAnswer
                        ? "border-positive bg-positive-soft"
                        : picked
                          ? "border-moss-400 bg-moss-50"
                          : "border-rule",
                      answerable ? "hover:border-moss-400" : "cursor-default",
                    )}
                  >
                    {opt.text}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {answerable && (
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" onClick={submit} disabled={!choice} loading={pending}>
              Kiểm tra
            </Button>
            {result && (
              <span className={cx("text-sm font-medium", result.isCorrect ? "text-positive" : "text-critical")}>
                {result.isCorrect ? "Chính xác" : "Chưa chính xác"}
              </span>
            )}
          </div>
        )}

        {result?.explanation && <p className="text-sm text-ink-soft">{result.explanation}</p>}

        {failed && <p className="text-xs text-critical">Không kiểm tra được câu trả lời. Thử lại sau.</p>}

        {!answerable && (
          <p className="text-xs text-ink-faint">
            Câu hỏi này để bạn tự ôn lại. Hãy đối chiếu với nội dung bài học phía trên.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** Maps a single picked option onto the response shape the scorer expects. */
function buildResponse(type: string, choice: string): Record<string, unknown> {
  if (type === "TRUE_FALSE") return { value: choice === "true" };
  if (type === "MULTI_CHOICE") return { choices: [choice] };
  return { choice };
}

export function LessonBlock({ block, lessonSlug }: { block: Block; lessonSlug?: string }) {
  switch (block.type) {
    case "HEADING": {
      const Tag = block.level === 3 ? "h3" : "h2";
      return <Tag>{block.text}</Tag>;
    }
    case "PARAGRAPH":
      return <p className="leading-relaxed text-ink">{block.text}</p>;
    case "LIST": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={block.ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </Tag>
      );
    }
    case "CALLOUT":
      return <CalloutBlock block={block} />;
    case "IMAGE":
      return (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.alt} className="w-full rounded-[var(--radius-card)] border border-rule" />
          {block.caption && <figcaption className="text-xs text-ink-faint">{block.caption}</figcaption>}
        </figure>
      );
    case "VIDEO":
      return (
        <figure className="space-y-2">
          <div className="scroll-x">
            {isYoutube(block.url) ? (
              <iframe
                src={youtubeEmbedUrl(block.url)}
                title={block.caption ?? "Video bài học"}
                className="aspect-video w-full rounded-[var(--radius-card)] border border-rule"
                allowFullScreen
              />
            ) : (
               
              <video src={block.url} controls className="w-full rounded-[var(--radius-card)] border border-rule" />
            )}
          </div>
          {block.caption && <figcaption className="text-xs text-ink-faint">{block.caption}</figcaption>}
        </figure>
      );
    case "TABLE":
      return (
        <LedgerTable
          headers={block.headers}
          rows={block.rows}
          align={block.headers.map((_, i) => (i === 0 ? "left" : "right"))}
          caption={block.caption}
        />
      );
    case "KEY_TERM":
      return (
        <Card tone="flat">
          <CardBody>
            <LedgerLabel>Thuật ngữ</LedgerLabel>
            <p className="mt-1 font-display text-base font-semibold">{block.term}</p>
            <p className="mt-1 text-sm text-ink-soft">{block.definition}</p>
          </CardBody>
        </Card>
      );
    case "EXAMPLE":
      return (
        <Card>
          <CardBody>
            <LedgerLabel>{block.title ?? "Ví dụ"}</LedgerLabel>
            <p className="mt-1 text-sm leading-relaxed">{block.text}</p>
          </CardBody>
        </Card>
      );
    case "CHECK_QUESTION":
      return <CheckQuestionBlock block={block} lessonSlug={lessonSlug} />;
    case "CALCULATOR":
      return <CalculatorBlock block={block} />;
    case "SIM_LINK":
      return (
        <Card tone="ink">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{block.label ?? "Thử ngay trong mô phỏng"}</p>
            <Link
              // The sim screens live under /sims/<type>/<sessionId>, so the hub
              // is what opens a sim by slug and creates the session.
              href={`/sims?start=${encodeURIComponent(block.simSlug)}`}
              className="rounded-[var(--radius-control)] border border-paper/40 px-3 py-1.5 text-sm font-medium"
            >
              Vào mô phỏng
            </Link>
          </CardBody>
        </Card>
      );
    case "DIVIDER":
      return <hr className="border-rule" />;
    default:
      return null;
  }
}

export function LessonBlocks({ blocks, lessonSlug }: { blocks: Block[]; lessonSlug?: string }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => (
        <LessonBlock key={i} block={block} lessonSlug={lessonSlug} />
      ))}
    </div>
  );
}
