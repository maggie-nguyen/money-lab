"use client";

/**
 * The auth panel illustration: a topographic "money map" of the MoneyLab
 * journey, drawn in the Sổ Cái style (layered moss, cream contour hairlines,
 * ochre accents).
 *
 * Colors are literal rather than themed on purpose. The panel is a single
 * constant artwork the way a photograph would be, so it reads the same on the
 * light and the dark ledger. Everything is vector, so it costs no image
 * download and stays crisp on any display.
 */
import { useT } from "@/components/Providers";

export function LedgerScene({
  className,
  /** Crop window into the artwork. The banner variant frames the middle of the route. */
  viewBox = "0 0 900 1200",
  /**
   * Namespace for the gradient ids. Two scenes on one page must not share them:
   * a duplicate id resolves to whichever came first in the document, and a hidden
   * copy leaves the visible one with no paint at all.
   */
  uid = "ml",
}: {
  className?: string;
  viewBox?: string;
  uid?: string;
}) {
  const t = useT();
  const sky = `${uid}-sky`;
  const glow = `${uid}-glow`;
  const scrim = `${uid}-scrim`;

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role="img"
      aria-label={t("art.ledger.aria")}
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b2a1e" />
          <stop offset="55%" stopColor="#15442f" />
          <stop offset="100%" stopColor="#1d5940" />
        </linearGradient>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e3b45f" stopOpacity="0.2" />
          <stop offset="55%" stopColor="#e3b45f" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#e3b45f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={scrim} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#082016" stopOpacity="0" />
          <stop offset="100%" stopColor="#082016" stopOpacity="0.78" />
        </linearGradient>
      </defs>

      {/* Ground and sky */}
      <rect width="900" height="1200" fill={`url(#${sky})`} />
      <ellipse cx="672" cy="176" rx="420" ry="330" fill={`url(#${glow})`} />

      {/* Ledger ruling across the sky, the quietest nod to the brand */}
      <g stroke="#f0ead9" strokeOpacity="0.06" strokeWidth="1">
        {[80, 128, 176, 224, 272, 320, 368, 416].map((y) => (
          <line key={y} x1="0" y1={y} x2="900" y2={y} />
        ))}
      </g>

      {/* The coin standing in for the sun */}
      <g>
        <circle cx="672" cy="176" r="66" fill="#e3b45f" />
        <circle cx="672" cy="176" r="54" fill="none" stroke="#0b2a1e" strokeOpacity="0.28" strokeWidth="1.5" />
        <text
          x="672"
          y="176"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#0b2a1e"
          fillOpacity="0.72"
          fontSize="52"
          fontWeight="600"
          fontFamily="var(--font-display)"
        >
          đ
        </text>
        <circle cx="806" cy="88" r="11" fill="#e3b45f" fillOpacity="0.42" />
        <circle cx="552" cy="94" r="7" fill="#e3b45f" fillOpacity="0.3" />
      </g>

      {/* Four hill bands, far to near. Each carries offset contour hairlines. */}
      <Band
        d="M0,470 C150,412 262,502 400,470 C540,438 660,382 900,430 L900,1200 L0,1200 Z"
        edge="M0,470 C150,412 262,502 400,470 C540,438 660,382 900,430"
        fill="#2c7454"
      />
      <Band
        d="M0,622 C180,562 300,652 460,612 C620,572 762,542 900,592 L900,1200 L0,1200 Z"
        edge="M0,622 C180,562 300,652 460,612 C620,572 762,542 900,592"
        fill="#236046"
      />
      <Band
        d="M0,802 C160,752 320,832 500,792 C660,756 782,732 900,772 L900,1200 L0,1200 Z"
        edge="M0,802 C160,752 320,832 500,792 C660,756 782,732 900,772"
        fill="#1a4b37"
      />
      <Band
        d="M0,1002 C200,952 340,1022 520,986 C700,950 802,936 900,962 L900,1200 L0,1200 Z"
        edge="M0,1002 C200,952 340,1022 520,986 C700,950 802,936 900,962"
        fill="#123729"
      />

      {/* Trees, sized by band so the depth holds up */}
      <Grove y={470} scale={0.55} xs={[70, 132, 208, 596, 664, 742, 836]} tone="#35835f" />
      <Grove y={620} scale={0.75} xs={[46, 118, 214, 700, 784, 862]} tone="#2a6e50" />
      <Grove y={800} scale={0.95} xs={[62, 148, 246, 738, 828]} tone="#1f573f" />
      <Grove y={1000} scale={1.2} xs={[54, 806, 872]} tone="#164231" />

      {/* The path: one continuous route from today up to the summit */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M496,1210 C496,1108 366,1058 366,928 C366,846 516,834 536,760 C554,690 466,664 476,600 C486,540 596,528 640,474"
          stroke="#e8dfc7"
          strokeWidth="26"
        />
        <path
          d="M496,1210 C496,1108 366,1058 366,928 C366,846 516,834 536,760 C554,690 466,664 476,600 C486,540 596,528 640,474"
          stroke="#b8ab8c"
          strokeWidth="2"
          strokeDasharray="10 14"
        />
      </g>

      {/* Milestones along the route */}
      <g>
        <House x={272} y={920} />
        <Marker x={366} y={928} />
        <Label x={82} y={898} text={t("art.ledger.budget")} />

        <Shop x={620} y={772} />
        <Marker x={536} y={760} />
        <Label x={596} y={840} text={t("art.ledger.business")} />

        <Bank x={388} y={604} />
        <Marker x={476} y={600} />
        <Label x={288} y={668} text={t("art.ledger.invest")} />

        <Summit x={640} y={474} />
        <Label x={698} y={434} text={t("art.ledger.freedom")} />
      </g>

      {/* Keeps the caption text legible over the artwork */}
      <rect y="900" width="900" height="300" fill={`url(#${scrim})`} />
    </svg>
  );
}

/** One hill band plus the contour hairlines that give it relief. */
function Band({ d, edge, fill }: { d: string; edge: string; fill: string }) {
  return (
    <g>
      <path d={d} fill={fill} />
      <g fill="none" stroke="#f0ead9" strokeOpacity="0.14" strokeWidth="1.25">
        <path d={edge} transform="translate(0 30)" />
        <path d={edge} transform="translate(0 62)" />
        <path d={edge} transform="translate(0 100)" strokeOpacity="0.08" />
      </g>
    </g>
  );
}

/** A run of conifers sitting on a band, drawn from one shared silhouette. */
function Grove({ y, scale, xs, tone }: { y: number; scale: number; xs: number[]; tone: string }) {
  return (
    <g fill={tone}>
      {xs.map((x, i) => {
        // The alternating lean keeps a straight row from looking stamped.
        const h = 46 * scale * (i % 3 === 0 ? 1.18 : i % 3 === 1 ? 0.9 : 1.05);
        const w = 15 * scale;
        const base = y + 34 + (i % 2) * 16;
        return (
          <g key={`${x}-${i}`}>
            <path d={`M${x},${base - h} L${x + w},${base} L${x - w},${base} Z`} />
            <path d={`M${x},${base - h * 1.42} L${x + w * 0.72},${base - h * 0.5} L${x - w * 0.72},${base - h * 0.5} Z`} />
            <rect x={x - 1.6 * scale} y={base} width={3.2 * scale} height={7 * scale} fill="#0f3325" />
          </g>
        );
      })}
    </g>
  );
}

/** The hairline ring where the route touches a milestone. */
function Marker({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="13" fill="#0f3325" fillOpacity="0.5" />
      <circle cx={x} cy={y} r="13" fill="none" stroke="#e8dfc7" strokeWidth="2" />
      <circle cx={x} cy={y} r="4.5" fill="#e3b45f" />
    </g>
  );
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      fill="#f0ead9"
      fillOpacity="0.86"
      fontSize="21"
      fontWeight="600"
      letterSpacing="0.02em"
      fontFamily="var(--font-sans)"
    >
      {text}
    </text>
  );
}

/** Milestone one: the household ledger. */
function House({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="4" rx="52" ry="9" fill="#0f3325" fillOpacity="0.35" />
      <rect x="-38" y="-42" width="76" height="42" fill="#f3ece0" />
      <path d="M-48,-42 L0,-78 L48,-42 Z" fill="#c98a3c" />
      <rect x="-11" y="-24" width="22" height="24" fill="#2c7454" />
      <rect x="-31" y="-34" width="14" height="12" fill="#8fb9a2" />
      <rect x="17" y="-34" width="14" height="12" fill="#8fb9a2" />
      <rect x="22" y="-84" width="10" height="22" fill="#c98a3c" />
    </g>
  );
}

/** Milestone two: the small business. */
function Shop({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="4" rx="48" ry="8" fill="#0f3325" fillOpacity="0.35" />
      <rect x="-36" y="-46" width="72" height="46" fill="#f3ece0" />
      <rect x="-36" y="-62" width="72" height="16" fill="#c98a3c" />
      <g fill="#f3ece0" fillOpacity="0.65">
        <rect x="-30" y="-62" width="12" height="16" />
        <rect x="-6" y="-62" width="12" height="16" />
        <rect x="18" y="-62" width="12" height="16" />
      </g>
      <rect x="-26" y="-34" width="24" height="20" fill="#8fb9a2" />
      <rect x="6" y="-30" width="22" height="30" fill="#2c7454" />
    </g>
  );
}

/** Milestone three: the market, drawn as the classic pedimented hall. */
function Bank({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="4" rx="52" ry="8" fill="#0f3325" fillOpacity="0.35" />
      <rect x="-44" y="-8" width="88" height="8" fill="#e0d7c3" />
      <rect x="-38" y="-44" width="76" height="36" fill="#f3ece0" />
      <g fill="#cfc4ab">
        <rect x="-30" y="-44" width="9" height="36" />
        <rect x="-13" y="-44" width="9" height="36" />
        <rect x="4" y="-44" width="9" height="36" />
        <rect x="21" y="-44" width="9" height="36" />
      </g>
      <path d="M-46,-44 L0,-72 L46,-44 Z" fill="#c98a3c" />
    </g>
  );
}

/** The summit flag the whole route climbs toward. */
function Summit({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="2" rx="26" ry="6" fill="#0f3325" fillOpacity="0.35" />
      <rect x="-2" y="-62" width="4" height="64" fill="#e8dfc7" />
      <path d="M2,-62 L48,-48 L2,-34 Z" fill="#e3b45f" />
    </g>
  );
}
