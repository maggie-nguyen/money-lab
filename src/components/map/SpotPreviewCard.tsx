"use client";

import Link from "next/link";
import { useT } from "@/components/Providers";
import { Button, Card, CardBody, Chip, SectionTitle } from "@/components/ui";
import { formatVnd } from "@/lib/format";
import { formatFoodTag, type FoodSpotPin } from "@/lib/map";

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

        <div>
          <p className="figure text-lg font-semibold text-moss-700">
            {pin.avgPriceVnd ? formatVnd(pin.avgPriceVnd) : t("map.priceUnknown")}
          </p>
          <h3 className="mt-1 text-base font-semibold">{pin.name}</h3>
          {pin.address && <p className="mt-0.5 text-sm text-ink-faint">{pin.address}</p>}
        </div>

        {pin.note && <p className="text-sm leading-relaxed text-ink-soft">{pin.note}</p>}

        <div className="flex flex-wrap gap-2">
          {pin.tags.slice(0, 4).map((tag) => (
            <Chip key={tag}>{formatFoodTag(tag, t)}</Chip>
          ))}
          {pin.avgRating != null && <Chip tone="caution">★ {pin.avgRating}</Chip>}
          <Chip tone="neutral">{t("wallet.eat.reviewCount", { count: pin.reviewCount })}</Chip>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-rule pt-3">
          <Link href={`/ban-do/spot/${pin.id}`}>
            <Button size="sm">{t("map.viewSpot")}</Button>
          </Link>
          <Link href={`/ban-do/spot/${pin.id}#review`}>
            <Button size="sm" variant="secondary">
              {t("map.addReview")}
            </Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
