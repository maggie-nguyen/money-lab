"use client";

import { Chip, Card, CardBody, LedgerLabel, PageBackLink } from "@/components/ui";
import { formatVnd } from "@/lib/format";
import { formatFoodTag } from "@/lib/map";
import { useT } from "@/components/Providers";

export function SpotDetailHero({
  name,
  address,
  avgPriceVnd,
  avgRating,
  tags,
  note,
}: {
  name: string;
  address: string;
  avgPriceVnd: string | null;
  avgRating: number | null;
  tags: string[];
  note: string;
}) {
  const t = useT();

  return (
    <div className="space-y-5">
      <PageBackLink href="/food">{t("map.backToMap")}</PageBackLink>

      <div className="max-w-2xl">
        <LedgerLabel>{t("map.spotLabel")}</LedgerLabel>
        <h1 className="mt-1 text-2xl sm:text-3xl">{name}</h1>
        {address && <p className="mt-1 text-sm text-ink-faint">{address}</p>}
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-6 border-b border-rule pb-4">
            {avgPriceVnd && (
              <div>
                <p className="text-xs text-ink-faint">{t("map.typicalPrice")}</p>
                <p className="figure mt-0.5 text-2xl font-semibold text-moss-700">{formatVnd(avgPriceVnd)}</p>
              </div>
            )}
            {avgRating != null && (
              <Chip tone="caution" className="text-sm">
                ★ {avgRating} {t("map.ratingLabel")}
              </Chip>
            )}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Chip key={tag}>{formatFoodTag(tag, t)}</Chip>
              ))}
            </div>
          )}

          {note && (
            <p className="text-sm leading-relaxed text-ink-soft">{note}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
