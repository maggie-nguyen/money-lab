"use client";

import Link from "next/link";
import { useT } from "@/components/Providers";
import { Button, Card, CardBody, Chip, SectionTitle, cx } from "@/components/ui";
import { formatVnd } from "@/lib/format";
import { formatFoodTag, type FoodSpotPin } from "@/lib/map";

function SpotPreviewBody({
  pin,
  compact,
}: {
  pin: FoodSpotPin;
  compact?: boolean;
}) {
  const t = useT();

  return (
    <>
      <div className={compact ? "min-w-0 flex-1" : undefined}>
        <p className="figure text-lg font-semibold text-moss-700">
          {pin.avgPriceVnd ? formatVnd(pin.avgPriceVnd) : t("map.priceUnknown")}
        </p>
        <h3 className={cx("font-semibold", compact ? "mt-0.5 truncate text-sm" : "mt-1 text-base")}>
          {pin.name}
        </h3>
        {pin.address && (
          <p className={cx("text-ink-faint", compact ? "mt-0.5 truncate text-xs" : "mt-0.5 text-sm")}>
            {pin.address}
          </p>
        )}
      </div>

      {!compact && pin.note && (
        <p className="text-sm leading-relaxed text-ink-soft">{pin.note}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {pin.tags.slice(0, compact ? 2 : 4).map((tag) => (
          <Chip key={tag}>{formatFoodTag(tag, t)}</Chip>
        ))}
        {pin.avgRating != null && <Chip tone="caution">★ {pin.avgRating}</Chip>}
        {!compact && (
          <Chip tone="neutral">{t("wallet.eat.reviewCount", { count: pin.reviewCount })}</Chip>
        )}
      </div>
    </>
  );
}

/** Floating preview on the map canvas — primary click feedback for pins. */
export function SpotMapOverlay({
  pin,
  onClose,
}: {
  pin: FoodSpotPin;
  onClose: () => void;
}) {
  const t = useT();

  return (
    <div
      data-testid="map-spot-overlay"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 sm:p-4"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      <Card className="pointer-events-auto border-moss-200 bg-paper-raised/98 shadow-lg backdrop-blur-sm">
        <CardBody className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <SpotPreviewBody pin={pin} compact />
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-[var(--radius-control)] border border-rule px-2 py-1 text-xs text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
              aria-label={t("map.closeSpot")}
            >
              {t("map.closeSpot")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-rule pt-3">
            <Link href={`/food/spot/${pin.id}`} data-testid="map-spot-detail-link">
              <Button size="sm">{t("map.viewSpot")}</Button>
            </Link>
            <Link href={`/food/spot/${pin.id}#review`}>
              <Button size="sm" variant="secondary">
                {t("map.addReview")}
              </Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/** Sidebar / below-map panel (legacy layout). */
export function SpotPreviewCard({ pin, onClose }: { pin: FoodSpotPin; onClose: () => void }) {
  const t = useT();

  return (
    <Card>
      <CardBody className="space-y-3">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-ink-faint hover:text-ink"
              aria-label={t("map.closeSpot")}
            >
              {t("map.closeSpot")}
            </button>
          }
        >
          {t("map.selectedSpot")}
        </SectionTitle>

        <SpotPreviewBody pin={pin} />

        <div className="flex flex-wrap gap-2 border-t border-rule pt-3">
          <Link href={`/food/spot/${pin.id}`}>
            <Button size="sm">{t("map.viewSpot")}</Button>
          </Link>
          <Link href={`/food/spot/${pin.id}#review`}>
            <Button size="sm" variant="secondary">
              {t("map.addReview")}
            </Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
