"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { cx } from "@/components/ui";
import {
  type FoodSpotPin,
  formatPinPrice,
  markerColor,
  pinPriceTier,
} from "@/lib/map";

function PriceTagPin({
  label,
  tier,
  selected,
}: {
  label: string;
  tier: ReturnType<typeof pinPriceTier>;
  selected: boolean;
}) {
  const fill = markerColor(tier);

  return (
    <div
      className={cx(
        "figure relative whitespace-nowrap rounded-[var(--radius-control)] border-2 px-2 py-0.5 text-[11px] font-bold leading-none shadow-sm transition-transform",
        selected ? "scale-110" : "hover:scale-105",
      )}
      style={{
        backgroundColor: fill,
        borderColor: selected ? "#0e3123" : "#ffffff",
        color: "#ffffff",
      }}
    >
      {label}
      <span
        className="absolute left-1/2 top-full -translate-x-1/2 border-[6px] border-transparent"
        style={{ borderTopColor: fill }}
        aria-hidden
      />
    </div>
  );
}

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
          <AdvancedMarker
            key={pin.id}
            position={{ lat: pin.lat, lng: pin.lng }}
            title={`${pin.name} · ${priceLabel}`}
            zIndex={isSelected ? 1000 : tier === "cheap" ? 100 : 50}
            onClick={() => onSelect(isSelected ? null : pin)}
          >
            <PriceTagPin label={priceLabel} tier={tier} selected={isSelected} />
          </AdvancedMarker>
        );
      })}
    </>
  );
}
