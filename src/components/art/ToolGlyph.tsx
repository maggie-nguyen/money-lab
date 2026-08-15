/**
 * Line marks for the six calculators, drawn in the same hairline weight as
 * TopicGlyph so the tools index reads as part of the same drawing set.
 *
 * Each mark says what the tool answers, not what it is: the compound interest
 * mark is a curve pulling away from a straight line, the compare mark is two
 * bars measured against each other, the inflation mark is a coin losing ground.
 */
export type ToolKind =
  | "compound-interest"
  | "loan-payment"
  | "loan-compare"
  | "savings-goal"
  | "inflation"
  | "budget-503020";

export function ToolGlyph({ kind, className }: { kind: ToolKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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

const MARKS: Record<ToolKind, React.ReactNode> = {
  // The curve leaving the straight line: that gap is the interest.
  "compound-interest": (
    <>
      <path d="M8 41h34M8 41V7" />
      <path d="M8 41L38 17" strokeOpacity="0.45" strokeDasharray="3 4" />
      <path d="M8 41C22 41 32 33 38 9" stroke={accent} strokeWidth="2.4" />
      <circle cx="38" cy="9" r="2.6" stroke={accent} strokeWidth="2.4" />
    </>
  ),
  // Equal instalments marching to the end of the term.
  "loan-payment": (
    <>
      <rect x="7" y="14" width="34" height="22" rx="3" />
      <path d="M7 21h34" strokeOpacity="0.5" />
      <path d="M13 28h5M22 28h5M31 28h5" stroke={accent} strokeWidth="2.2" />
    </>
  ),
  // Two offers on one scale, the cheaper one marked.
  "loan-compare": (
    <>
      <path d="M8 41h32" />
      <rect x="12" y="19" width="9" height="22" rx="1.5" />
      <rect x="27" y="27" width="9" height="14" rx="1.5" stroke={accent} strokeWidth="2.2" />
      <path d="M12 14h9M27 14h9" strokeOpacity="0.4" />
    </>
  ),
  // The target, and the months it takes to reach it.
  "savings-goal": (
    <>
      <circle cx="24" cy="24" r="15" />
      <circle cx="24" cy="24" r="8" strokeOpacity="0.5" />
      <circle cx="24" cy="24" r="2.4" stroke={accent} strokeWidth="2.4" />
      <path d="M24 9v-5M39 24h5" strokeOpacity="0.4" />
    </>
  ),
  // The same coin, worth less each year.
  inflation: (
    <>
      <circle cx="15" cy="21" r="11" />
      <text
        x="15"
        y="21"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        stroke="none"
        fontSize="14"
        fontWeight="600"
      >
        đ
      </text>
      <circle cx="35" cy="27" r="7" stroke={accent} strokeDasharray="3.5 3.5" />
      <text
        x="35"
        y="27"
        textAnchor="middle"
        dominantBaseline="central"
        fill={accent}
        stroke="none"
        fontSize="9"
        fontWeight="600"
      >
        đ
      </text>
    </>
  ),
  // One income cut three ways.
  "budget-503020": (
    <>
      <rect x="7" y="17" width="34" height="14" rx="2" />
      <path d="M24 17v14M34 17v14" />
      <path d="M11 36h9" strokeOpacity="0.5" />
      <path d="M28 36h2M37 36h1" stroke={accent} strokeWidth="2.2" />
    </>
  ),
};
