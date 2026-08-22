/**
 * Line marks for savings challenges — same drawing language as TopicGlyph.
 */
export type ChallengeGlyphKind = "tea" | "rice" | "transport" | "fun" | "challenge";

const ICON_ALIASES: Record<string, ChallengeGlyphKind> = {
  tea: "tea",
  "bubble-tea": "tea",
  rice: "rice",
  delivery: "transport",
  transport: "transport",
  fun: "fun",
  shopping: "fun",
  challenge: "challenge",
};

export function challengeGlyphKind(iconKey: string): ChallengeGlyphKind {
  return ICON_ALIASES[iconKey] ?? "challenge";
}

export function ChallengeGlyph({
  kind,
  className,
}: {
  kind: ChallengeGlyphKind;
  className?: string;
}) {
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

const MARKS: Record<ChallengeGlyphKind, React.ReactNode> = {
  // Cup with a strike — skip bubble tea.
  tea: (
    <>
      <path d="M14 16h14v18c0 4-3 7-7 7s-7-3-7-7V16z" />
      <path d="M28 20h6c2 0 3 1 3 3v2c0 2-1 3-3 3h-6" />
      <path d="M18 10v6M22 10v4" strokeOpacity="0.45" />
      <path d="M8 8l32 32" stroke={accent} strokeWidth="2.4" />
    </>
  ),
  // Bowl under a ceiling price line.
  rice: (
    <>
      <path d="M10 28c0-8 6-14 14-14s14 6 14 14" />
      <path d="M8 28h32" />
      <path d="M6 22h36" stroke={accent} strokeWidth="2" strokeDasharray="4 3" />
      <path d="M30 14l4-4 4 4" strokeOpacity="0.45" />
    </>
  ),
  // Wheel and route — walk or bus instead of ride-hail.
  transport: (
    <>
      <circle cx="16" cy="34" r="5" />
      <circle cx="34" cy="34" r="5" />
      <path d="M11 28h26l-3-10H14l-3 10z" />
      <path d="M8 8l32 32" stroke={accent} strokeWidth="2.4" />
      <path d="M36 12c-2 2-4 2-6 0" strokeOpacity="0.45" />
    </>
  ),
  // Ticket with a spending cap.
  fun: (
    <>
      <path d="M11 14h26v20H11z" />
      <path d="M19 14v20M29 14v20" strokeOpacity="0.35" strokeDasharray="3 3" />
      <path d="M15 22h18M15 28h12" strokeOpacity="0.45" />
      <path d="M6 24h5M37 24h5" strokeOpacity="0.35" />
      <path d="M8 36h32" stroke={accent} strokeWidth="2" />
    </>
  ),
  // Generic streak calendar.
  challenge: (
    <>
      <rect x="9" y="11" width="30" height="28" rx="2" />
      <path d="M9 19h30M17 7v8M31 7v8" />
      <path d="M27 33l3 3 6-7" stroke={accent} strokeWidth="2.4" />
    </>
  ),
};
