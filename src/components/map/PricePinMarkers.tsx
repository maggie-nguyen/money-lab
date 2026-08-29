"use client";

import * as React from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Cluster, type Renderer, type ClusterStats } from "@googlemaps/markerclusterer";
import {
  type FoodSpotPin,
  formatPinPrice,
  pinPriceTier,
  priceMarkerIconUrl,
  clusterIconUrl,
} from "@/lib/map";

type GMarker = google.maps.Marker;

function makePinMarker(
  pin: FoodSpotPin,
  selected: boolean,
  onSelect: (pin: FoodSpotPin | null) => void,
): GMarker {
  const tier = pinPriceTier(pin.avgPriceVnd);
  const priceLabel = formatPinPrice(pin.avgPriceVnd);
  const marker = new window.google.maps.Marker({
    position: { lat: pin.lat, lng: pin.lng },
    title: `${pin.name} · ${priceLabel}`,
    zIndex: selected ? 1000 : tier === "cheap" ? 100 : tier === "mid" ? 80 : 50,
    icon: {
      url: priceMarkerIconUrl(priceLabel, tier, selected),
      scaledSize: { width: 52, height: 34, equals: () => false },
      anchor: { x: 26, y: 34, equals: () => false },
    },
  });
  marker.addListener("click", () => onSelect(selected ? null : pin));
  return marker;
}

/** Geoji-style zoom-out view: dark green count bubbles instead of dense price labels. */
const clusterRenderer: Renderer = {
  render(cluster: Cluster, _stats: ClusterStats, _map: google.maps.Map): GMarker {
    const count = cluster.count;
    const size = count >= 100 ? 44 : count >= 20 ? 38 : 32;
    const marker = new window.google.maps.Marker({
      position: cluster.position,
      zIndex: Math.round(window.google.maps.Marker.MAX_ZINDEX) - count,
      icon: {
        url: clusterIconUrl(count),
        scaledSize: { width: size, height: size, equals: () => false },
        anchor: { x: size / 2, y: size / 2, equals: () => false },
      },
    });
    return marker;
  },
};

export function PricePinMarkers({
  pins,
  selectedId,
  onSelect,
  onError,
}: {
  pins: FoodSpotPin[];
  selectedId: string | null;
  onSelect: (pin: FoodSpotPin | null) => void;
  onError?: (error: unknown) => void;
}) {
  const map = useMap();
  const [markers, setMarkers] = React.useState<GMarker[]>([]);
  const onSelectRef = React.useRef(onSelect);
  const onErrorRef = React.useRef(onError);
  onSelectRef.current = onSelect;
  onErrorRef.current = onError;

  React.useEffect(() => {
    if (!map || !window.google?.maps) return;
    const next: GMarker[] = [];
    try {
      for (const pin of pins) {
        next.push(
          makePinMarker(pin, pin.id === selectedId, (p) => onSelectRef.current(p)),
        );
      }
    } catch (error) {
      for (const marker of next) marker.setMap(null);
      setMarkers([]);
      onErrorRef.current?.(error);
      return;
    }
    setMarkers(next);
    return () => {
      for (const m of next) {
        m.setMap(null);
      }
    };
  }, [map, pins, selectedId]);

  React.useEffect(() => {
    if (!map || markers.length === 0) return;
    let clusterer: MarkerClusterer;
    try {
      clusterer = new MarkerClusterer({
        map,
        markers,
        renderer: clusterRenderer,
        algorithmOptions: { maxZoom: 18 },
      });
    } catch (error) {
      onErrorRef.current?.(error);
      return;
    }
    return () => clusterer.setMap(null);
  }, [map, markers]);

  return null;
}
