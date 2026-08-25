"use client";

import * as React from "react";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** Build a Google Places photo media URL from a photo resource name (no image bytes stored). */
function photoUrl(name: string, max = 320): string {
  return `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${max}&maxHeightPx=${max}&key=${MAPS_KEY}`;
}

export function SpotGallery({
  gallery,
  className,
}: {
  gallery: string[] | undefined;
  className?: string;
}) {
  if (!gallery || gallery.length === 0 || !MAPS_KEY) return null;
  return (
    <div className={className ?? "flex gap-2 overflow-x-auto py-1"}>
      {gallery.slice(0, 6).map((name, i) => (
        // external Google CDN media — optimized at the Places edge, not stored
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${name}-${i}`}
          src={photoUrl(name, 320)}
          alt=""
          loading="lazy"
          className="h-20 w-28 shrink-0 rounded-[var(--radius-control)] border border-rule object-cover"
        />
      ))}
    </div>
  );
}
