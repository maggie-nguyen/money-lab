/**
 * Line marks for the Ví của tôi pillars.
 *
 * Same vocabulary as TopicGlyph: hairline strokes, one caution accent,
 * currentColor so they inherit moss on cards and cream on cover scrims.
 */
export type WalletGlyphKind = "mind" | "manage" | "life" | "habits" | "map";

export function WalletGlyph({ kind, className }: { kind: WalletGlyphKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {MARKS[kind]}
    </svg>
  );
}

const accent = "var(--color-caution)";

const MARKS: Record<WalletGlyphKind, React.ReactNode> = {
  // Thought bubble with a coin — spending psychology.
  mind: (
    <>
      <path d="M8 18c0-6 6-11 16-11s16 5 16 11-6 11-10 11c-2 0-3 2-5 4-1 1-3 1-3-1v-3c-4-1-14-4-14-11z" />
      <circle cx="18" cy="18" r="2.5" fill="currentColor" stroke="none" fillOpacity="0.35" />
      <circle cx="24" cy="16" r="2.5" fill="currentColor" stroke="none" fillOpacity="0.35" />
      <circle cx="30" cy="18" r="2.5" fill="currentColor" stroke="none" fillOpacity="0.35" />
      <circle cx="34" cy="34" r="7" stroke={accent} strokeWidth="2" />
      <text
        x="34"
        y="34.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontSize="9"
        fontWeight="600"
        stroke="none"
      >
        đ
      </text>
    </>
  ),
  // Split columns — monthly jar budget.
  manage: (
    <>
      <rect x="7" y="10" width="34" height="28" rx="2" />
      <path d="M7 18h34M19 18v20" />
      <path d="M23 24h14M23 30h14" strokeOpacity="0.45" />
      <path d="M11 24h4M11 30h4M11 36h4" strokeOpacity="0.45" />
      <path d="M23 36h14" stroke={accent} strokeWidth="2.4" />
    </>
  ),
  // Bowl and route — daily student spending.
  life: (
    <>
      <path d="M10 28c0-8 6-14 14-14s14 6 14 14" />
      <path d="M8 28h32" />
      <path d="M14 32h20" strokeOpacity="0.45" />
      <circle cx="36" cy="14" r="4" stroke={accent} strokeWidth="2" />
      <path d="M36 18v6M33 21h6" stroke={accent} strokeWidth="2" />
    </>
  ),
  // Calendar with a streak tick.
  habits: (
    <>
      <rect x="9" y="11" width="30" height="28" rx="2" />
      <path d="M9 19h30M17 7v8M31 7v8" />
      <path d="M15 27h6M27 27h6M15 33h6" strokeOpacity="0.4" />
      <path d="M27 33l3 3 6-7" stroke={accent} strokeWidth="2.4" />
    </>
  ),
  // Map pin on a ruled grid.
  map: (
    <>
      <path d="M8 8h32v32H8z" strokeOpacity="0.35" />
      <path d="M8 18h32M8 28h32M18 8v32M28 8v32" strokeOpacity="0.2" />
      <path d="M24 12c-4 0-7 3-7 7 0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" stroke={accent} strokeWidth="2" />
      <circle cx="24" cy="19" r="2.5" fill="currentColor" stroke="none" fillOpacity="0.5" />
    </>
  ),
};
