/**
 * The MoneyLab UI kit, template A "Sổ Cái".
 *
 * Rules for anyone adding to this file:
 *  - colors come only from the tokens in globals.css (bg-paper, text-ink, ...)
 *  - money and aligned figures carry the `figure` class for tabular numerals
 *  - a card is a hairline box on raised paper, never a drop shadow
 */
"use client";

import * as React from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors " +
  "disabled:opacity-50 disabled:pointer-events-none rounded-[var(--radius-control)]";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-moss-600 text-paper hover:bg-moss-700",
  secondary: "border border-rule-strong text-ink hover:bg-paper-sunken bg-transparent",
  ghost: "text-ink-soft hover:text-ink hover:bg-paper-sunken",
  danger: "border border-critical text-critical hover:bg-critical-soft bg-transparent",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
    />
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  className,
  tone = "raised",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "raised" | "ink" | "flat" }) {
  const tones = {
    raised: "bg-paper-raised border border-rule",
    ink: "bg-moss-600 text-paper border border-moss-600",
    flat: "bg-paper-sunken border border-rule",
  } as const;
  return (
    <div className={cx("rounded-[var(--radius-card)]", tones[tone], className)} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("p-5", className)}>{children}</div>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
      <h2 className="text-lg">{children}</h2>
      {action}
    </div>
  );
}

export function LedgerLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("ledger-label", className)}>{children}</div>;
}

/* -------------------------------------------------------------- Stat strip */

export interface StatItem {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

/** The ledger strip used on the home and profile screens. */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 divide-rule border-y border-rule sm:grid-cols-4 sm:divide-x">
      {items.map((s) => (
        <div key={s.label} className="px-4 py-3 max-sm:border-b max-sm:border-rule max-sm:last:border-b-0 max-sm:[&:nth-last-child(2)]:border-b-0">
          <LedgerLabel>{s.label}</LedgerLabel>
          <div className="figure mt-1 text-2xl font-semibold">
            {s.value}
            {s.hint && <span className="ml-1.5 text-xs font-normal text-moss-400">{s.hint}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Progress */

export function ProgressBar({
  value,
  max = 100,
  className,
  label,
}: {
  value: number;
  max?: number;
  className?: string;
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-moss-400 transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------- Chips */

type ChipTone = "neutral" | "moss" | "positive" | "caution" | "critical";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "bg-paper-sunken text-ink-soft border-rule",
  moss: "bg-moss-50 text-moss-600 border-moss-200",
  positive: "bg-positive-soft text-positive border-transparent",
  caution: "bg-caution-soft text-caution border-transparent",
  critical: "bg-critical-soft text-critical border-transparent",
};

export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        CHIP_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- Forms */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-critical">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-[var(--radius-control)] border border-rule-strong bg-paper-raised px-3 py-2 " +
  "text-sm text-ink placeholder:text-ink-faint focus:border-moss-400 focus:outline-none";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(CONTROL, className)} {...rest} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cx(CONTROL, className)} {...rest}>
        {children}
      </select>
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(CONTROL, "min-h-[90px] resize-y", className)} {...rest} />;
  },
);

/** Money input. Keeps the raw digit string so no float ever touches money. */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (digits: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const display = value === "" ? "" : value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="numeric"
        disabled={disabled}
        className={cx(CONTROL, "figure pr-8 text-right")}
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          onChange(digits);
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">₫</span>
    </div>
  );
}

/* --------------------------------------------------------------- Feedback */

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "critical" | "positive";
  title?: string;
  children?: React.ReactNode;
}) {
  const tones = {
    info: "bg-moss-50 border-moss-200 text-ink",
    warning: "bg-caution-soft border-caution/30 text-ink",
    critical: "bg-critical-soft border-critical/30 text-ink",
    positive: "bg-positive-soft border-positive/30 text-ink",
  } as const;
  return (
    <div role={tone === "critical" ? "alert" : undefined} className={cx("rounded-[var(--radius-card)] border px-4 py-3 text-sm", tones[tone])}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-rule-strong px-6 py-10 text-center">
      <p className="font-display text-lg">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-paper-sunken", className)} />;
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof Error && error.message ? error.message : "Không tải được dữ liệu.";
  return (
    <Alert tone="critical" title="Có lỗi xảy ra">
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </Alert>
  );
}

/* ------------------------------------------------------------------ Dialog */

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  React.useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "max-h-[90dvh] w-full overflow-y-auto rounded-t-[12px] border border-rule bg-paper-raised sm:rounded-[var(--radius-card)]",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-rule px-5 py-3">
          <h2 className="text-base">{title}</h2>
          {onClose && (
            <button onClick={onClose} aria-label="Đóng" className="text-ink-faint hover:text-ink">
              ✕
            </button>
          )}
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-rule px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Table */

export function LedgerTable({
  headers,
  rows,
  align,
  caption,
}: {
  headers: React.ReactNode[];
  rows: React.ReactNode[][];
  /** "right" for money columns. */
  align?: Array<"left" | "right">;
  caption?: string;
}) {
  return (
    <div className="scroll-x">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="pb-2 text-left text-xs text-ink-faint">{caption}</caption>}
        <thead>
          <tr className="border-b border-rule-strong">
            {headers.map((h, i) => (
              <th
                key={i}
                scope="col"
                // px keeps neighbouring headers from touching when a column is narrow.
                className={cx(
                  "ledger-label px-3 py-2 font-semibold first:pl-0 last:pr-0",
                  align?.[i] === "right" ? "text-right" : "text-left",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-rule last:border-b-0">
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={cx(
                    "px-3 py-2 align-top first:pl-0 last:pr-0",
                    align?.[ci] === "right" ? "figure text-right" : "text-left",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
