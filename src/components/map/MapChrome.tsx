"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/components/Providers";
import { Button, cx } from "@/components/ui";
import { formatPinPrice, MAP_DEFAULTS, type FoodSpotPin, type MapCenter } from "@/lib/map";

interface FoodClusterSummary {
  slug: string;
  name: string;
  city: string;
  lat: number | null;
  lng: number | null;
}

const FALLBACK_AREAS: { slug: string; center: MapCenter }[] = [
  { slug: "hanoi", center: MAP_DEFAULTS.hanoi },
  { slug: "saigon", center: MAP_DEFAULTS.hcm },
];

export function MapAreaLinks({ onJump }: { onJump: (center: MapCenter) => void }) {
  const t = useT();
  const query = useQuery({
    queryKey: ["food", "clusters"],
    queryFn: () => api.get<FoodClusterSummary[]>("/food/clusters"),
    staleTime: 300_000,
  });

  const areas =
    query.data?.filter((c) => c.lat != null && c.lng != null).map((c) => ({
      slug: c.slug,
      label: c.slug === "saigon" ? t("map.area.hcm") : t("map.area.hanoi"),
      center: { lat: c.lat!, lng: c.lng!, zoom: 15 } satisfies MapCenter,
    })) ??
    FALLBACK_AREAS.map((a) => ({
      slug: a.slug,
      label: a.slug === "saigon" ? t("map.area.hcm") : t("map.area.hanoi"),
      center: a.center,
    }));

  return (
    <div className="flex flex-col gap-2">
      {areas.map((a) => (
        <Button
          key={a.slug}
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-start"
          onClick={() => onJump(a.center)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export function MapSpotList({
  pins,
  selectedId,
  onSelect,
  onFocus,
}: {
  pins: FoodSpotPin[];
  selectedId: string | null;
  onSelect: (pin: FoodSpotPin | null) => void;
  onFocus: (center: MapCenter) => void;
}) {
  const t = useT();

  if (!pins.length) {
    return <p className="text-sm text-ink-faint">{t("map.spotListEmpty")}</p>;
  }

  const sorted = [...pins].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const visible = sorted.slice(0, 80);
  const hidden = sorted.length - visible.length;

  return (
    <ul
      data-testid="map-spot-list"
      className="max-h-64 divide-y divide-rule overflow-y-auto border border-rule rounded-[var(--radius-control)]"
    >
      {visible.map((pin) => {
        const active = pin.id === selectedId;
        return (
          <li key={pin.id}>
            <button
              type="button"
              onClick={() => {
                onSelect(active ? null : pin);
                onFocus({ lat: pin.lat, lng: pin.lng, zoom: 16 });
              }}
              className={cx(
                "flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                active ? "bg-moss-50 text-moss-700" : "hover:bg-paper-sunken",
              )}
            >
              <span className="figure shrink-0 font-semibold tabular-nums text-moss-600">
                {formatPinPrice(pin.avgPriceVnd)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{pin.name}</span>
                {pin.address && (
                  <span className="mt-0.5 block truncate text-xs text-ink-faint">{pin.address}</span>
                )}
              </span>
          </button>
        </li>
      );
      })}
      {hidden > 0 && (
        <li className="bg-paper-sunken px-3 py-2 text-xs text-ink-faint">
          {t("map.listMore", { count: hidden })}
        </li>
      )}
    </ul>
  );
}
