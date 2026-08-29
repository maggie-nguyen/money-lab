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
import { Alert, Card, CardBody, LedgerLabel, LedgerTable } from "@/components/ui";
import type { Block } from "@/lib/types";
import { useT } from "@/components/Providers";

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

function CalloutBlock({ block }: { block: Extract<Block, { type: "CALLOUT" }> }) {
  const tone = block.variant === "WARNING" ? "warning" : block.variant === "TIP" ? "positive" : "info";
  return (
    <Alert tone={tone} title={block.title}>
      {block.text}
    </Alert>
  );
}

export function LessonBlock({ block }: { block: Block }) {
  const t = useT();
  switch (block.type) {
    case "HEADING": {
      const isH3 = block.level === 3;
      const Tag = isH3 ? "h3" : "h2";
      return (
        <Tag
          className={
            isH3
              ? "font-display text-lg font-semibold leading-snug tracking-tight text-ink"
              : "font-display text-xl font-semibold leading-snug tracking-tight text-ink sm:text-2xl"
          }
        >
          {block.text}
        </Tag>
      );
    }
    case "PARAGRAPH":
      return <p className="leading-relaxed text-ink-soft">{block.text}</p>;
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
                title={block.caption ?? t("blocks.videoTitle")}
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
            <LedgerLabel>{t("blocks.term")}</LedgerLabel>
            <p className="mt-1 font-display text-base font-semibold">{block.term}</p>
            <p className="mt-1 text-sm text-ink-soft">{block.definition}</p>
          </CardBody>
        </Card>
      );
    case "EXAMPLE":
      return (
        <Card>
          <CardBody>
            <LedgerLabel>{block.title ?? t("blocks.example")}</LedgerLabel>
            <p className="mt-1 text-sm leading-relaxed">{block.text}</p>
          </CardBody>
        </Card>
      );
    case "CHECK_QUESTION":
    case "CALCULATOR":
    case "SIM_LINK":
      // Dead block types from removed features (lessons/tools/sims) — never render.
      return null;
    case "DIVIDER":
      return <hr className="border-rule" />;
    default:
      return null;
  }
}

export function LessonBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => (
        <LessonBlock key={i} block={block} />
      ))}
    </div>
  );
}
