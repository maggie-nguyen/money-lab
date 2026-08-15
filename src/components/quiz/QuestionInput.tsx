/**
 * Per-type answer input for a quiz question, doc 03 §5 / doc 05 §4.
 * Response shapes must match src/server/lib/quizScoring.ts exactly:
 *   SINGLE_CHOICE  { choice: string }
 *   MULTI_CHOICE   { choices: string[] }
 *   TRUE_FALSE     { value: boolean }
 *   NUMERIC        { value: string }            // digit string, no formatting
 *   ORDERING       { order: string[] }
 *   MATCHING       { pairs: Record<string, string> }
 *   SCENARIO_CHOICE{ choice: string }
 *
 * ORDERING uses up/down buttons rather than drag and drop, so it stays
 * keyboard accessible. MATCHING uses one select per left-hand item.
 *
 * In "review" mode (after submit) the input renders read-only and marks the
 * learner's response against `correctResponse` from AttemptState.result.perQuestion.
 */
"use client";

import * as React from "react";
import { cx, Input, Select } from "@/components/ui";
import type { QuestionPublic } from "@/lib/types";

export interface QuestionInputProps {
  question: QuestionPublic;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  /** Present only after submit: switches to a read-only, marked view. */
  mode?: "answer" | "review";
  correctResponse?: unknown;
}

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json {
  return v && typeof v === "object" ? (v as Json) : {};
}

function optionRow({
  selected,
  correct,
  wrong,
  mode,
}: {
  selected: boolean;
  correct?: boolean;
  wrong?: boolean;
  mode?: "answer" | "review";
}): string {
  if (mode !== "review") return selected ? "border-moss-400 bg-moss-50" : "border-rule";
  if (correct) return "border-positive bg-positive-soft";
  if (wrong) return "border-critical bg-critical-soft";
  return "border-rule";
}

export function QuestionInput({ question, value, onChange, disabled, mode = "answer", correctResponse }: QuestionInputProps) {
  const payload = question.payload as Json;
  const readOnly = mode === "review" || disabled;

  switch (question.type) {
    case "SINGLE_CHOICE":
    case "SCENARIO_CHOICE": {
      const options = Array.isArray(payload.options) ? (payload.options as string[]) : [];
      const optionsText = asRecord(payload.optionsText) as Record<string, string>;
      const scenarioMd = typeof payload.scenarioMd === "string" ? payload.scenarioMd : null;
      const chosen = asRecord(value).choice as string | undefined;
      const correctKey = asRecord(correctResponse).choice as string | undefined;
      return (
        <div className="space-y-3">
          {scenarioMd && <p className="text-sm leading-relaxed text-ink-soft">{scenarioMd}</p>}
          <div role="radiogroup" aria-label={question.prompt} className="space-y-2">
            {options.map((key) => {
              const selected = chosen === key;
              const correct = mode === "review" && key === correctKey;
              const wrong = mode === "review" && selected && key !== correctKey;
              return (
                <label
                  key={key}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-sm",
                    optionRow({ selected, correct, wrong, mode }),
                    readOnly && "cursor-default",
                  )}
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={selected}
                    disabled={readOnly}
                    onChange={() => onChange({ choice: key })}
                    className="h-4 w-4"
                  />
                  <span>{optionsText[key] ?? key}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    case "MULTI_CHOICE": {
      const options = Array.isArray(payload.options) ? (payload.options as string[]) : [];
      const optionsText = asRecord(payload.optionsText) as Record<string, string>;
      const chosen = new Set(Array.isArray(asRecord(value).choices) ? (asRecord(value).choices as string[]) : []);
      const correctSet = new Set(
        Array.isArray(asRecord(correctResponse).choices) ? (asRecord(correctResponse).choices as string[]) : [],
      );
      function toggle(key: string) {
        const next = new Set(chosen);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onChange({ choices: Array.from(next) });
      }
      return (
        <div className="space-y-2">
          {options.map((key) => {
            const selected = chosen.has(key);
            const correct = mode === "review" && correctSet.has(key);
            const wrong = mode === "review" && selected && !correctSet.has(key);
            return (
              <label
                key={key}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-sm",
                  optionRow({ selected, correct, wrong, mode }),
                  readOnly && "cursor-default",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={readOnly}
                  onChange={() => toggle(key)}
                  className="h-4 w-4"
                />
                <span>{optionsText[key] ?? key}</span>
              </label>
            );
          })}
        </div>
      );
    }

    case "TRUE_FALSE": {
      const chosen = asRecord(value).value as boolean | undefined;
      const correctVal = asRecord(correctResponse).value as boolean | undefined;
      const choices: Array<{ v: boolean; label: string }> = [
        { v: true, label: "Đúng" },
        { v: false, label: "Sai" },
      ];
      return (
        <div className="flex gap-3">
          {choices.map((c) => {
            const selected = chosen === c.v;
            const correct = mode === "review" && c.v === correctVal;
            const wrong = mode === "review" && selected && c.v !== correctVal;
            return (
              <button
                key={String(c.v)}
                type="button"
                disabled={readOnly}
                onClick={() => onChange({ value: c.v })}
                className={cx(
                  "flex-1 rounded-[var(--radius-control)] border px-4 py-2 text-sm font-medium",
                  optionRow({ selected, correct, wrong, mode }),
                  readOnly && "cursor-default",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      );
    }

    case "NUMERIC": {
      const unit = typeof payload.unit === "string" ? payload.unit : null;
      const hint = typeof payload.inputHint === "string" ? payload.inputHint : undefined;
      const raw = asRecord(value).value as string | undefined;
      const correctVal = asRecord(correctResponse).value as string | undefined;
      return (
        <div className="space-y-1.5">
          <div className="relative max-w-xs">
            <Input
              inputMode="numeric"
              value={raw ?? ""}
              disabled={readOnly}
              placeholder={hint}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d-]/g, "");
                onChange({ value: digits });
              }}
              className={cx("figure", unit && "pr-12")}
            />
            {unit && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">
                {unit}
              </span>
            )}
          </div>
          {mode === "review" && correctVal !== undefined && (
            <p className="figure text-xs text-ink-faint">Đáp án đúng: {correctVal}</p>
          )}
        </div>
      );
    }

    case "ORDERING": {
      const itemsText = asRecord(payload.itemsText) as Record<string, string>;
      const defaultOrder = Array.isArray(payload.items) ? (payload.items as string[]) : [];
      const order = Array.isArray(asRecord(value).order) ? (asRecord(value).order as string[]) : defaultOrder;
      const correctOrder = Array.isArray(asRecord(correctResponse).order)
        ? (asRecord(correctResponse).order as string[])
        : undefined;

      function move(index: number, dir: -1 | 1) {
        const target = index + dir;
        if (target < 0 || target >= order.length) return;
        const next = order.slice();
        const a = next[index];
        const b = next[target];
        if (a === undefined || b === undefined) return;
        next[index] = b;
        next[target] = a;
        onChange({ order: next });
      }

      return (
        <ol className="space-y-2">
          {order.map((key, i) => {
            const correct = mode === "review" && correctOrder?.[i] === key;
            const wrong = mode === "review" && correctOrder && correctOrder[i] !== key;
            return (
              <li
                key={key}
                className={cx(
                  "flex items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-sm",
                  optionRow({ selected: false, correct, wrong, mode }),
                )}
              >
                <span>
                  <span className="ledger-label mr-2">{i + 1}</span>
                  {itemsText[key] ?? key}
                </span>
                {!readOnly && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Di chuyển lên"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="rounded-[var(--radius-control)] border border-rule-strong px-2 py-1 text-xs disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Di chuyển xuống"
                      onClick={() => move(i, 1)}
                      disabled={i === order.length - 1}
                      className="rounded-[var(--radius-control)] border border-rule-strong px-2 py-1 text-xs disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      );
    }

    case "MATCHING": {
      const left = Array.isArray(payload.left) ? (payload.left as string[]) : [];
      const right = Array.isArray(payload.right) ? (payload.right as string[]) : [];
      const leftText = asRecord(payload.leftText) as Record<string, string>;
      const rightText = asRecord(payload.rightText) as Record<string, string>;
      const pairs = asRecord(asRecord(value).pairs) as Record<string, string>;
      const correctPairs = asRecord(asRecord(correctResponse).pairs) as Record<string, string>;

      function setPair(leftKey: string, rightKey: string) {
        onChange({ pairs: { ...pairs, [leftKey]: rightKey } });
      }

      return (
        <div className="space-y-2">
          {left.map((lk) => {
            const chosenRight = pairs[lk];
            const correct = mode === "review" && correctPairs[lk] === chosenRight;
            const wrong = mode === "review" && chosenRight !== undefined && correctPairs[lk] !== chosenRight;
            return (
              <div
                key={lk}
                className={cx(
                  "flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-sm",
                  optionRow({ selected: false, correct, wrong, mode }),
                )}
              >
                <span className="min-w-[40%]">{leftText[lk] ?? lk}</span>
                <Select
                  value={chosenRight ?? ""}
                  disabled={readOnly}
                  onChange={(e) => setPair(lk, e.target.value)}
                  className="max-w-[60%]"
                >
                  <option value="" disabled>
                    Chọn một mục
                  </option>
                  {right.map((rk) => (
                    <option key={rk} value={rk}>
                      {rightText[rk] ?? rk}
                    </option>
                  ))}
                </Select>
                {mode === "review" && correctPairs[lk] && correctPairs[lk] !== chosenRight && (
                  <span className="w-full text-xs text-ink-faint">
                    Đáp án đúng: {rightText[correctPairs[lk]] ?? correctPairs[lk]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    default:
      return null;
  }
}
