/**
 * Deterministic cover art for a course, article or lesson that has no image.
 *
 * Drawn in the same Sổ Cái language as the auth panel: layered bands, cream
 * contour hairlines, one ochre accent. Everything is derived from a hash of the
 * slug, so a piece of content keeps the same cover forever, across renders and
 * across machines, with no image request and nothing to upload.
 *
 * This is deliberately not a random generator. Four band silhouettes and six
 * palettes give enough variety that a grid of cards does not look stamped, and
 * few enough that the wall of them still looks like one product.
 */
import { coverPalette, hashSlug } from "@/lib/cover";

/** Skyline silhouettes, far to near. Index picked from the slug hash. */
const RIDGES = [
  ["M0,150 C90,116 170,168 260,140 C340,116 400,96 480,120 L480,300 L0,300 Z", "M0,196 C120,168 190,214 300,192 C390,174 430,166 480,182 L480,300 L0,300 Z"],
  ["M0,178 C70,140 150,150 220,182 C300,218 380,152 480,166 L480,300 L0,300 Z", "M0,224 C100,206 160,238 250,226 C350,212 410,196 480,214 L480,300 L0,300 Z"],
  ["M0,132 C120,160 180,104 280,124 C370,142 420,178 480,150 L480,300 L0,300 Z", "M0,200 C90,224 180,178 280,196 C380,214 430,230 480,212 L480,300 L0,300 Z"],
  ["M0,160 C80,182 150,128 240,146 C340,166 390,124 480,144 L480,300 L0,300 Z", "M0,218 C110,196 170,232 260,220 C360,206 420,222 480,206 L480,300 L0,300 Z"],
] as const;

/**
 * The motif riding the horizon. One idea each, drawn large and low contrast so
 * it reads as texture behind a title rather than as an icon competing with it.
 *
 * Every motif is kept inside roughly y 80 to 200. The widest frame that uses
 * this art, the featured library card, slices the 480x300 box down to about
 * that band, and a motif drawn higher comes out with its top cut off.
 */
function Motif({ kind, ink }: { kind: number; ink: string }) {
  const common = { fill: "none", stroke: ink, strokeOpacity: 0.5, strokeWidth: 3 } as const;
  switch (kind) {
    case 0: // a coin, the plainest statement of the subject
      return (
        <g transform="translate(372 130)">
          <circle r="46" fill={ink} fillOpacity="0.16" />
          <circle r="46" {...common} />
          <circle r="34" {...common} strokeOpacity={0.28} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill={ink}
            fillOpacity="0.62"
            fontSize="44"
            fontWeight="600"
            fontFamily="var(--font-display)"
          >
            đ
          </text>
        </g>
      );
    case 1: // growth, as a column chart climbing to the right
      return (
        <g transform="translate(318 84)" fill={ink} fillOpacity="0.22">
          <rect x="0" y="62" width="20" height="34" />
          <rect x="30" y="42" width="20" height="54" />
          <rect x="60" y="24" width="20" height="72" />
          <rect x="90" y="2" width="20" height="94" />
          <path d="M4,52 L38,32 L68,16 L104,-4" {...common} strokeOpacity={0.45} />
        </g>
      );
    case 2: // a shield, for the lessons about not being taken for a ride
      return (
        <g transform="translate(374 82)">
          <path d="M0,0 L44,16 L44,58 C44,86 24,104 0,114 C-24,104 -44,86 -44,58 L-44,16 Z" fill={ink} fillOpacity="0.16" />
          <path d="M0,0 L44,16 L44,58 C44,86 24,104 0,114 C-24,104 -44,86 -44,58 L-44,16 Z" {...common} />
          <path d="M-18,56 L-4,72 L20,40" {...common} strokeWidth={5} strokeOpacity={0.5} />
        </g>
      );
    default: // compounding, as an arc leaving a straight line behind
      return (
        <g transform="translate(310 84)">
          <path d="M0,106 L120,106" {...common} strokeOpacity={0.3} />
          <path d="M0,106 C46,104 76,84 96,10" {...common} strokeWidth={5} />
          <path d="M0,106 L120,26" {...common} strokeOpacity={0.28} strokeDasharray="8 10" />
          <circle cx="96" cy="10" r="8" fill={ink} fillOpacity="0.5" />
        </g>
      );
  }
}

export function CoverArt({ slug, className }: { slug: string; className?: string }) {
  const h = hashSlug(slug);
  const p = coverPalette(slug);
  const ridge = RIDGES[h % RIDGES.length]!;
  const uid = `cv${h.toString(36)}`;

  return (
    <svg
      viewBox="0 0 480 300"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      // Decorative: the title always sits next to it, so a screen reader
      // announcing the cover would only repeat what it just read.
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor={p.from} />
          <stop offset="100%" stopColor={p.to} />
        </linearGradient>
      </defs>

      <rect width="480" height="300" fill={`url(#${uid}-sky)`} />

      {/* Ledger ruling, the same quiet nod the auth panel makes */}
      <g stroke={p.ink} strokeOpacity="0.07" strokeWidth="1">
        {[36, 68, 100, 132, 164, 196, 228, 260].map((y) => (
          <line key={y} x1="0" y1={y} x2="480" y2={y} />
        ))}
      </g>

      {/* Two bands, each with its contour hairline, so the card has depth. The
          motif sits between them: the far ridge stays behind it, the near one
          cuts across its base, which is what gives the card its sense of depth. */}
      <g>
        <path d={ridge[0]} fill={p.band1} fillOpacity="0.85" />
        <path d={ridge[0]} fill="none" stroke={p.ink} strokeOpacity="0.16" strokeWidth="1.25" transform="translate(0 14)" />
      </g>

      <Motif kind={h % 4} ink={p.ink} />

      <g>
        <path d={ridge[1]} fill={p.band2} />
        <path d={ridge[1]} fill="none" stroke={p.ink} strokeOpacity="0.12" strokeWidth="1.25" transform="translate(0 16)" />
      </g>
    </svg>
  );
}
