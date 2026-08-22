"use client";

import { Marker } from "@vis.gl/react-google-maps";
import {
  type FoodSpotPin,
  formatPinPrice,
  pinPriceTier,
  priceMarkerIconUrl,
} from "@/lib/map";

export function PricePinMarkers({
  pins,
  selectedId,
  onSelect,
}: {
  pins: FoodSpotPin[];
  selectedId: string | null;
  onSelect: (pin: FoodSpotPin | null) => void;
}) {
  return (
    <>
      {pins.map((pin) => {
        const tier = pinPriceTier(pin.avgPriceVnd);
        const isSelected = pin.id === selectedId;
        const priceLabel = formatPinPrice(pin.avgPriceVnd);

        return (
          <Marker
            key={pin.id}
            position={{ lat: pin.lat, lng: pin.lng }}
            title={`${pin.name} · ${priceLabel}`}
            zIndex={isSelected ? 1000 : tier === "cheap" ? 100 : 50}
            icon={{
              url: priceMarkerIconUrl(priceLabel, tier, isSelected),
              scaledSize: { width: 52, height: 34, equals: () => false },
              anchor: { x: 26, y: 34, equals: () => false },
            }}
            onClick={() => onSelect(isSelected ? null : pin)}
          />
        );
      })}
    </>
  );
}
