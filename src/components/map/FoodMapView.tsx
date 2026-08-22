"use client";

import * as React from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/components/Providers";
import {
  Button,
  Card,
  CardBody,
  Field,
  LedgerLabel,
  SectionTitle,
  cx,
} from "@/components/ui";
import { MapAreaLinks, MapSpotList } from "@/components/map/MapChrome";
import { PricePinMarkers } from "@/components/map/PricePinMarkers";
import { SpotPreviewCard } from "@/components/map/SpotPreviewCard";
import {
  MAP_DEFAULTS,
  MAP_FILTER_TAGS,
  FoodTag,
  isInVietnam,
  type FoodTagId,
  type FoodSpotPin,
  type MapBounds,
  type MapCenter,
  type PriceFilter,
  matchesPriceFilter,
} from "@/lib/map";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
/** Required for AdvancedMarker (custom price tags). Use DEMO_MAP_ID until you create a Map ID in Cloud Console. */
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

function BoundsWatcher({ onBounds }: { onBounds: (b: MapBounds) => void }) {
  const map = useMap();
  React.useEffect(() => {
    if (!map) return;
    const emit = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      onBounds({ swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() });
    };
    emit();
    const idle = map.addListener("idle", emit);
    return () => idle.remove();
  }, [map, onBounds]);
  return null;
}

function MapJumpHandler({ target }: { target: MapCenter | null }) {
  const map = useMap();
  React.useEffect(() => {
    if (!map || !target) return;
    map.panTo({ lat: target.lat, lng: target.lng });
    map.setZoom(target.zoom);
  }, [map, target]);
  return null;
}

type FilterChip =
  | { kind: "price"; id: PriceFilter; label: string }
  | { kind: "tag"; label: string; value: FoodTagId };

const TAG_FILTER_LABELS: Record<(typeof MAP_FILTER_TAGS)[number], string> = {
  [FoodTag.RICE]: "map.filter.rice",
  [FoodTag.NOODLES]: "map.filter.noodles",
  [FoodTag.BUBBLE_TEA]: "map.filter.tea",
  [FoodTag.CANTEEN]: "map.filter.canteen",
};

function MapFilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-[var(--radius-control)] border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-moss-200 bg-moss-50 text-moss-700"
          : "border-rule bg-paper-raised text-ink-soft hover:bg-paper-sunken hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function FoodMapView() {
  const t = useT();
  const [bounds, setBounds] = React.useState<MapBounds | null>(null);
  const [selected, setSelected] = React.useState<FoodSpotPin | null>(null);
  const [priceFilter, setPriceFilter] = React.useState<PriceFilter>("all");
  const [tagFilter, setTagFilter] = React.useState<FoodTagId | null>(null);
  const [maxPriceK, setMaxPriceK] = React.useState(35);
  const [jumpTarget, setJumpTarget] = React.useState<MapCenter | null>(null);
  const [locationNotice, setLocationNotice] = React.useState<string | null>(null);

  const boundsKey = bounds
    ? `${bounds.swLat.toFixed(3)},${bounds.swLng.toFixed(3)},${bounds.neLat.toFixed(3)},${bounds.neLng.toFixed(3)}`
    : null;

  const spotsQuery = useQuery({
    queryKey: ["food", "map", boundsKey],
    queryFn: () => {
      const b = bounds!;
      return api.get<FoodSpotPin[]>("/food/spots", {
        swLat: b.swLat,
        swLng: b.swLng,
        neLat: b.neLat,
        neLng: b.neLng,
      });
    },
    enabled: bounds != null,
    staleTime: 60_000,
  });

  const filters: FilterChip[] = [
    { kind: "price", id: "all", label: t("map.filter.all") },
    { kind: "price", id: "under25", label: t("map.filter.under25") },
    { kind: "price", id: "under35", label: t("map.filter.under35") },
    ...MAP_FILTER_TAGS.map((tag) => ({
      kind: "tag" as const,
      label: t(TAG_FILTER_LABELS[tag]),
      value: tag,
    })),
  ];

  const allPins = spotsQuery.data ?? [];
  const pins = allPins.filter((p) => {
    if (!matchesPriceFilter(p, priceFilter)) return false;
    if (tagFilter && !p.tags.includes(tagFilter)) return false;
    if (p.avgPriceVnd && Number(p.avgPriceVnd) > maxPriceK * 1000) return false;
    return true;
  });

  function handleNearMe() {
    if (!navigator.geolocation) {
      setLocationNotice(t("map.geolocationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (isInVietnam(latitude, longitude)) {
          setLocationNotice(null);
          setJumpTarget({ lat: latitude, lng: longitude, zoom: 16 });
        } else {
          setLocationNotice(t("map.nearMeOutsideVn"));
          setJumpTarget(MAP_DEFAULTS.hcm);
        }
      },
      () => setLocationNotice(t("map.geolocationDenied")),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  if (!MAPS_KEY) {
    return (
      <div className="space-y-4">
        <header className="max-w-2xl space-y-2">
          <LedgerLabel>{t("nav.map")}</LedgerLabel>
          <h1 className="text-2xl">{t("map.noApiKeyTitle")}</h1>
          <p className="text-sm text-ink-soft">{t("map.noApiKeyDescription")}</p>
        </header>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="max-w-2xl space-y-2">
        <LedgerLabel>{t("nav.map")}</LedgerLabel>
        <h1 className="text-2xl sm:text-3xl">{t("map.metaTitle")}</h1>
        <p className="text-sm leading-relaxed text-ink-soft">{t("map.metaDescription")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-5">
              <div>
                <SectionTitle>{t("map.areasLabel")}</SectionTitle>
                <MapAreaLinks onJump={setJumpTarget} />
              </div>

              <div className="border-t border-rule pt-4">
                <SectionTitle>{t("map.filtersLabel")}</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {filters.map((f, i) => {
                    const active =
                      f.kind === "tag" ? tagFilter === f.value : priceFilter === f.id && !tagFilter;
                    return (
                      <MapFilterButton
                        key={`${f.kind}-${i}`}
                        active={active}
                        onClick={() => {
                          if (f.kind === "tag") {
                            setTagFilter(tagFilter === f.value ? null : f.value);
                            setPriceFilter("all");
                          } else {
                            setPriceFilter(f.id);
                            setTagFilter(null);
                          }
                        }}
                      >
                        {f.label}
                      </MapFilterButton>
                    );
                  })}
                </div>
              </div>

              <Field label={t("map.maxPrice", { amount: maxPriceK })} htmlFor="price-slider">
                <input
                  id="price-slider"
                  type="range"
                  min={15}
                  max={50}
                  step={5}
                  value={maxPriceK}
                  onChange={(e) => setMaxPriceK(Number(e.target.value))}
                  className="h-1.5 w-full accent-moss-600"
                />
              </Field>

              <Button type="button" variant="secondary" size="sm" className="w-full" onClick={handleNearMe}>
                {t("map.nearMe")}
              </Button>

              {locationNotice && (
                <p className="text-xs leading-relaxed text-caution">{locationNotice}</p>
              )}

              {!spotsQuery.isLoading && pins.length === 0 && (
                <div className="rounded-[var(--radius-control)] border border-rule bg-paper-sunken px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  <p>{t("map.outsideCoverage")}</p>
                  <p className="mt-1">{t("map.outsideCoverageHint")}</p>
                </div>
              )}

              <p className="text-xs text-ink-faint">
                {spotsQuery.isLoading ? t("map.loading") : t("map.spotCount", { count: pins.length })}
              </p>
            </CardBody>
          </Card>

          {selected && (
            <div className="hidden lg:block">
              <SpotPreviewCard pin={selected} onClose={() => setSelected(null)} />
            </div>
          )}

          <Card className="lg:hidden">
            <CardBody>
              <SectionTitle>{t("map.spotListLabel")}</SectionTitle>
              <MapSpotList
                pins={pins}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
                onFocus={setJumpTarget}
              />
            </CardBody>
          </Card>

          <Card className="hidden lg:block">
            <CardBody>
              <SectionTitle>{t("map.spotListLabel")}</SectionTitle>
              <MapSpotList
                pins={pins}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
                onFocus={setJumpTarget}
              />
            </CardBody>
          </Card>
        </aside>

        <div>
          <Card className="overflow-hidden">
            <div className="relative h-[min(52vh,24rem)] lg:h-[min(68vh,40rem)]">
              <APIProvider apiKey={MAPS_KEY} language="vi" region="VN">
                <Map
                  mapId={MAP_ID}
                  defaultCenter={{ lat: MAP_DEFAULTS.fallback.lat, lng: MAP_DEFAULTS.fallback.lng }}
                  defaultZoom={MAP_DEFAULTS.fallback.zoom}
                  gestureHandling="greedy"
                  disableDefaultUI
                  zoomControl
                  mapTypeControl={false}
                  streetViewControl={false}
                  fullscreenControl={false}
                  className="h-full w-full"
                  onClick={() => setSelected(null)}
                >
                  <BoundsWatcher onBounds={setBounds} />
                  <MapJumpHandler target={jumpTarget} />
                  <PricePinMarkers
                    pins={pins}
                    selectedId={selected?.id ?? null}
                    onSelect={setSelected}
                  />
                </Map>
              </APIProvider>

              {spotsQuery.isLoading && (
                <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                  <span className="rounded-[var(--radius-control)] border border-rule bg-paper-raised px-3 py-1 text-xs text-ink-soft">
                    {t("map.loading")}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {selected && (
            <div className="mt-4 lg:hidden">
              <SpotPreviewCard pin={selected} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
