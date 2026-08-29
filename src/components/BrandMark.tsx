/** Ledger tile + serif M — matches the Sổ Cái display type. */
export function BrandMark({
  className,
  size = 32,
  title = "Money&Me",
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <rect width="32" height="32" rx="7" fill="#14432f" />
      <rect x="4" y="4" width="24" height="24" rx="2" fill="#faf8f3" />
      <text
        x="16"
        y="23.5"
        textAnchor="middle"
        fill="#14432f"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 19,
          fontWeight: 700,
        }}
      >
        M
      </text>
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={className ?? "font-display text-xl font-semibold tracking-tight"}>
      Money&amp;Me
    </span>
  );
}
