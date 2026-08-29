"use client";

import * as React from "react";
import Link from "next/link";
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

import { SpotMapOverlay } from "@/components/map/SpotPreviewCard";
import {
  MAP_DEFAULTS,
  MAP_FILTER_TAGS,
  FoodTag,
  boundsCenter,
  boundsFromCenter,
  isInVietnam,
  type FoodTagId,
  type FoodSpotPin,
  type MapBounds,
  type MapCenter,
  type PriceFilter,
  matchesPriceFilter,
} from "@/lib/map";

const GOOGLE_MAP_LOAD_TIMEOUT_MS = 20_000;

class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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

export function FoodMapView({ mapsApiKey }: { mapsApiKey: string }) {
  const t = useT();
  const didAutoRecenter = React.useRef(false);
  const [canLoadGoogleMap, setCanLoadGoogleMap] = React.useState(false);
  const [googleMapFailed, setGoogleMapFailed] = React.useState(false);
  const [googleMapReady, setGoogleMapReady] = React.useState(false);
  const [googleMapAttempt, setGoogleMapAttempt] = React.useState(0);
  const [markerLayerFailed, setMarkerLayerFailed] = React.useState(false);
  const [bounds, setBounds] = React.useState<MapBounds | null>(() =>
    boundsFromCenter(MAP_DEFAULTS.fallback),
  );
  const [selected, setSelected] = React.useState<FoodSpotPin | null>(null);
  const [priceFilter, setPriceFilter] = React.useState<PriceFilter>("all");
  const [tagFilter, setTagFilter] = React.useState<FoodTagId | null>(null);
  const [maxPriceK, setMaxPriceK] = React.useState(60);
  const [jumpTarget, setJumpTarget] = React.useState<MapCenter | null>(null);
  const [locationNotice, setLocationNotice] = React.useState<string | null>(null);

  const boundsKey = bounds
    ? `${bounds.swLat.toFixed(3)},${bounds.swLng.toFixed(3)},${bounds.neLat.toFixed(3)},${bounds.neLng.toFixed(3)}`
    : null;

  const spotsQuery = useQuery({
    queryKey: ["food", "map", boundsKey],
    queryFn: ({ signal }) => {
      const b = bounds!;
      return api.get<FoodSpotPin[]>("/food/spots", {
        swLat: b.swLat,
        swLng: b.swLng,
        neLat: b.neLat,
        neLng: b.neLng,
      }, signal);
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
          const target = { lat: latitude, lng: longitude, zoom: 16 };
          setJumpTarget(target);
          setBounds(boundsFromCenter(target));
        } else {
          setLocationNotice(t("map.nearMeOutsideVn"));
          setJumpTarget(MAP_DEFAULTS.hanoi);
          setBounds(boundsFromCenter(MAP_DEFAULTS.hanoi));
        }
      },
      () => setLocationNotice(t("map.geolocationDenied")),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  function handleSelectPin(pin: FoodSpotPin | null) {
    setSelected(pin);
    if (pin) setJumpTarget({ lat: pin.lat, lng: pin.lng, zoom: 16 });
  }

  function handleAreaJump(target: MapCenter) {
    setSelected(null);
    setJumpTarget(target);
    // Keep the list useful even when Google is blocked, offline, or over quota.
    setBounds(boundsFromCenter(target));
  }

  function retryGoogleMap() {
    if (!navigator.onLine) {
      setLocationNotice(t("map.offlineNotice"));
      return;
    }
    setLocationNotice(null);
    setGoogleMapFailed(false);
    setGoogleMapReady(false);
    setMarkerLayerFailed(false);
    setCanLoadGoogleMap(true);
    setGoogleMapAttempt((attempt) => attempt + 1);
  }

  /** If the viewport is outside Vietnam (common when abroad), jump to seeded data in Hanoi. */
  React.useEffect(() => {
    if (didAutoRecenter.current || !bounds || spotsQuery.isLoading) return;
    if (allPins.length > 0) return;
    const center = boundsCenter(bounds);
    if (!isInVietnam(center.lat, center.lng)) {
      didAutoRecenter.current = true;
      setLocationNotice(t("map.abroadHint"));
      setJumpTarget(MAP_DEFAULTS.hanoi);
    }
  }, [allPins.length, bounds, spotsQuery.isLoading, t]);

  /**
   * Google reports key, billing and quota failures through this global callback.
   * Install it before mounting APIProvider so a rejected map becomes a useful
   * list view instead of a blank canvas.
   */
  React.useEffect(() => {
    if (!mapsApiKey) return;
    const mapsWindow = window as typeof window & { gm_authFailure?: () => void };
    const previous = mapsWindow.gm_authFailure;
    const handleAuthFailure = () => {
      setGoogleMapFailed(true);
      setGoogleMapReady(false);
      previous?.();
    };
    mapsWindow.gm_authFailure = handleAuthFailure;
    if (navigator.onLine) setCanLoadGoogleMap(true);
    else setGoogleMapFailed(true);
    return () => {
      if (mapsWindow.gm_authFailure === handleAuthFailure) {
        mapsWindow.gm_authFailure = previous;
      }
    };
  }, []);

  /** A quota-rejected or stalled map never emits tilesloaded, so fail closed. */
  React.useEffect(() => {
    if (!mapsApiKey || !canLoadGoogleMap || googleMapFailed || googleMapReady) return;
    const timeout = window.setTimeout(() => {
      setGoogleMapFailed(true);
      setGoogleMapReady(false);
    }, GOOGLE_MAP_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [canLoadGoogleMap, googleMapAttempt, googleMapFailed, googleMapReady]);

  /** Recover automatically when the device reconnects after an initial offline load. */
  React.useEffect(() => {
    const handleOnline = () => {
      if (googleMapFailed && mapsApiKey) retryGoogleMap();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  });

  const googleMapUnavailable = !mapsApiKey || googleMapFailed;

  return (
    <div className="space-y-6">
      <header className="max-w-2xl space-y-2">
        <LedgerLabel>{t("nav.map")}</LedgerLabel>
        <h1 className="text-2xl sm:text-3xl">{t("map.metaTitle")}</h1>
        <p className="text-sm leading-relaxed text-ink-soft">{t("map.metaDescription")}</p>
        <p className="text-xs text-ink-faint">{t("map.dataCoverageHint")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-5">
              <div>
                <SectionTitle>{t("map.areasLabel")}</SectionTitle>
                <MapAreaLinks onJump={handleAreaJump} />
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
                  max={60}
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

              {spotsQuery.isError && (
                <div
                  className="rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft px-3 py-3 text-xs leading-relaxed text-ink"
                  role="alert"
                >
                  <p className="font-semibold">{t("map.dataUnavailableTitle")}</p>
                  <p className="mt-1 text-ink-soft">{t("map.dataUnavailableDescription")}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => spotsQuery.refetch()}
                  >
                    {t("common.retry")}
                  </Button>
                </div>
              )}

              {!spotsQuery.isLoading && !spotsQuery.isError && pins.length === 0 && bounds && (
                <div className="rounded-[var(--radius-control)] border border-rule bg-paper-sunken px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  {allPins.length > 0 ? (
                    <p>{t("map.spotListEmpty")}</p>
                  ) : isInVietnam(boundsCenter(bounds).lat, boundsCenter(bounds).lng) ? (
                    <>
                      <p>{t("map.noPricedSpotsInView")}</p>
                      <p className="mt-1">{t("map.noPricedSpotsHint")}</p>
                      <p className="mt-1 font-medium text-moss-700">{t("map.noPricedSpotsCta")}</p>
                      <Link
                        href="/ban-do/them-quan"
                        className="mt-2 inline-block text-xs font-semibold text-moss-700 underline"
                      >
                        {t("map.addSpotCta")}
                      </Link>
                    </>
                  ) : (
                    <>
                      <p>{t("map.outsideCoverage")}</p>
                      <p className="mt-1">{t("map.outsideCoverageHint")}</p>
                    </>
                  )}
                </div>
              )}

              <p className="text-xs text-ink-faint">
                {spotsQuery.isLoading
                  ? t("map.loading")
                  : spotsQuery.isError
                    ? t("map.dataUnavailableShort")
                    : t("map.spotCount", { count: pins.length })}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionTitle>{t("map.spotListLabel")}</SectionTitle>
              <MapSpotList
                pins={pins}
                selectedId={selected?.id ?? null}
                onSelect={handleSelectPin}
                onFocus={setJumpTarget}
              />
            </CardBody>
          </Card>
        </aside>

        <div>
          <Card className="overflow-hidden">
            <div className="relative h-[min(52vh,24rem)] lg:h-[min(68vh,40rem)]">
              {googleMapUnavailable ? (
                <div
                  className="flex h-full items-center justify-center bg-paper-sunken px-6 text-center"
                  role="status"
                >
                  <div className="max-w-md space-y-2">
                    <p className="font-semibold text-ink">{t("map.googleUnavailableTitle")}</p>
                    <p className="text-sm leading-relaxed text-ink-soft">
                      {t("map.googleUnavailableDescription")}
                    </p>
                    {mapsApiKey && (
                      <Button type="button" variant="secondary" size="sm" onClick={retryGoogleMap}>
                        {t("map.retryMap")}
                      </Button>
                    )}
                  </div>
                </div>
              ) : canLoadGoogleMap ? (
                <MapErrorBoundary
                  key={googleMapAttempt}
                  onError={() => {
                    setGoogleMapFailed(true);
                    setGoogleMapReady(false);
                  }}
                >
                  <APIProvider
                    apiKey={mapsApiKey}
                    language="vi"
                    region="VN"
                    onError={() => {
                      setGoogleMapFailed(true);
                      setGoogleMapReady(false);
                    }}
                  >
                    <Map
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
                      onTilesLoaded={() => setGoogleMapReady(true)}
                    >
                      <BoundsWatcher onBounds={setBounds} />
                      <MapJumpHandler target={jumpTarget} />
                      {!markerLayerFailed && (
                        <PricePinMarkers
                          pins={pins}
                          selectedId={selected?.id ?? null}
                          onSelect={handleSelectPin}
                          onError={() => setMarkerLayerFailed(true)}
                        />
                      )}
                    </Map>
                  </APIProvider>
                </MapErrorBoundary>
              ) : (
                <div className="h-full bg-paper-sunken" aria-hidden="true" />
              )}

              {!googleMapUnavailable && (!googleMapReady || spotsQuery.isLoading) && (
                <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                  <span className="rounded-[var(--radius-control)] border border-rule bg-paper-raised px-3 py-1 text-xs text-ink-soft">
                    {t("map.loading")}
                  </span>
                </div>
              )}

              {markerLayerFailed && !googleMapUnavailable && (
                <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                  <span className="rounded-[var(--radius-control)] border border-caution/30 bg-paper-raised px-3 py-1 text-xs text-caution">
                    {t("map.markerUnavailable")}
                  </span>
                </div>
              )}

              {selected && (
                <SpotMapOverlay pin={selected} onClose={() => setSelected(null)} />
              )}
            </div>
            <p className="border-t border-rule px-3 py-2 text-[10px] leading-relaxed text-ink-faint">
              {t("map.osmAttribution")}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
