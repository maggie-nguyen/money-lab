/**
 * Line marks for the six topics on the landing page.
 *
 * Drawn rather than iconified on purpose: they share the hairline weight the
 * rest of the ledger uses, so a row of cards reads as one drawing set instead of
 * borrowed clip art. Stroke is `currentColor`, so a mark inherits the theme, and
 * the single warm accent uses the caution token, which is defined for both the
 * light and the dark ledger.
 */
export type TopicKind = "budget" | "credit" | "tax" | "scam" | "invest" | "business";

export function TopicGlyph({ kind, className }: { kind: TopicKind; className?: string }) {
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

const MARKS: Record<TopicKind, React.ReactNode> = {
  // A ledger page with its columns ruled and one line balanced.
  budget: (
    <>
      <rect x="9" y="7" width="30" height="34" rx="2" />
      <path d="M9 15h30M20 15v26" />
      <path d="M24 22h11M24 29h11" strokeOpacity="0.5" />
      <path d="M24 36h11" stroke={accent} strokeWidth="2.4" />
      <path d="M13 22h3M13 29h3M13 36h3" strokeOpacity="0.5" />
    </>
  ),
  // A card, with the chip and the rate that comes with it.
  credit: (
    <>
      <rect x="6" y="12" width="36" height="24" rx="3" />
      <path d="M6 20h36" />
      <rect x="11" y="25" width="7" height="5" rx="1" stroke={accent} strokeWidth="2" />
      <path d="M24 30h12" strokeOpacity="0.5" />
    </>
  ),
  // A stamped document: what you sign before you understand it.
  tax: (
    <>
      <path d="M13 5h14l8 8v30H13z" />
      <path d="M27 5v8h8" />
      <path d="M18 24h12M18 30h12" strokeOpacity="0.5" />
      <circle cx="33" cy="34" r="6" stroke={accent} strokeWidth="2" />
      <path d="M30.5 34l2 2 3.5-4" stroke={accent} strokeWidth="2" />
    </>
  ),
  // A message that wants you to hurry.
  scam: (
    <>
      <rect x="8" y="10" width="32" height="22" rx="3" />
      <path d="M8 14l16 11 16-11" />
      <path d="M17 36l7 6 7-6" strokeOpacity="0.4" />
      <path d="M24 17v5" stroke={accent} strokeWidth="2.4" />
      <path d="M24 26.5v0.5" stroke={accent} strokeWidth="2.8" />
    </>
  ),
  // Time in the ground, height later.
  invest: (
    <>
      <path d="M7 41h34" />
      <path d="M13 41V29M22 41V21M31 41V26M40 41V13" />
      <circle cx="40" cy="13" r="3.5" stroke={accent} strokeWidth="2" />
      <path d="M11 24c5-6 11-4 15-8" strokeOpacity="0.4" strokeDasharray="3 4" />
    </>
  ),
  // A shopfront: the smallest business that still has a balance sheet.
  business: (
    <>
      <path d="M9 20h30v21H9z" />
      <path d="M9 20l3-8h24l3 8" />
      <path d="M17 12v8M25 12v8M33 12v8" strokeOpacity="0.45" />
      <path d="M20 41V30h8v11" stroke={accent} strokeWidth="2" />
    </>
  ),
};
