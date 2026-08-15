/**
 * Deterministic cover art for content without an image.
 *
 * A missing coverImageUrl should not leave a grey rectangle, and it should not
 * change between renders either, so everything is picked from a hash of the
 * slug. Same slug, same cover, forever, with no image request.
 *
 * This module holds the palette and the hash. `CoverArt` in
 * src/components/art draws with them; `coverStyle` stays for the few places
 * that need a plain CSS background rather than an SVG, such as the scrim behind
 * a real uploaded image while it loads.
 */

export interface CoverPalette {
  /** Sky, top to bottom. */
  from: string;
  to: string;
  /** The two silhouette bands, far then near. */
  band1: string;
  band2: string;
  /** Hairlines and motif, always the warm cream so the family holds together. */
  ink: string;
}

const CREAM = "#f0ead9";

const PALETTES: readonly CoverPalette[] = [
  { from: "#0e3324", to: "#2a6b48", band1: "#1a4b37", band2: "#123729", ink: CREAM },
  { from: "#152c40", to: "#2f6584", band1: "#1d4762", band2: "#14324a", ink: CREAM },
  { from: "#3d2611", to: "#7d5324", band1: "#5a3a19", band2: "#3f2811", ink: CREAM },
  { from: "#2f1a38", to: "#63397a", band1: "#452858", band2: "#2e1a3c", ink: CREAM },
  { from: "#0f3434", to: "#1f6a64", band1: "#17514d", band2: "#0f3a37", ink: CREAM },
  { from: "#3c1a22", to: "#7c3644", band1: "#5a2530", band2: "#3d1a22", ink: CREAM },
];

/** Stable across renders, machines and deploys: plain string hash, no randomness. */
export function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

export function coverPalette(slug: string): CoverPalette {
  return PALETTES[hashSlug(slug) % PALETTES.length]!;
}

/** Inline style for a slug-keyed gradient cover, for non-SVG surfaces. */
export function coverStyle(slug: string): { backgroundImage: string } {
  const p = coverPalette(slug);
  return { backgroundImage: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)` };
}
