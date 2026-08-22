import Link from "next/link";
import { CoverArt } from "@/components/art/CoverArt";
import { WalletGlyph, type WalletGlyphKind } from "@/components/art/WalletGlyph";
import { coverStyle } from "@/lib/cover";
import { Card, CardBody, LedgerLabel } from "@/components/ui";

function CoverBand({
  slug,
  glyph,
  tag,
}: {
  slug: string;
  glyph: WalletGlyphKind;
  tag?: string;
}) {
  return (
    <div className="relative h-28 w-full shrink-0 overflow-hidden" style={coverStyle(slug)}>
      <CoverArt slug={slug} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-black/30" />
      {tag && (
        <LedgerLabel className="absolute left-4 top-3 text-white/75">{tag}</LedgerLabel>
      )}
      <WalletGlyph kind={glyph} className="absolute bottom-3 left-4 h-9 w-9 text-white/90" />
    </div>
  );
}

export function PillarCoverCard({
  href,
  coverSlug,
  glyph,
  title,
  description,
  tag,
  meta,
}: {
  href: string;
  coverSlug: string;
  glyph: WalletGlyphKind;
  title: string;
  description: string;
  tag?: string;
  meta?: string;
}) {
  return (
    <Link href={href} className="group block h-full">
      <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-moss-200 hover:bg-paper-sunken">
        <CoverBand slug={coverSlug} glyph={glyph} tag={tag} />
        <CardBody className="flex flex-1 flex-col gap-2.5">
          <div>
            <p className="font-display text-base font-semibold group-hover:text-moss-600">{title}</p>
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-soft">{description}</p>
          </div>
          {meta && <p className="figure mt-auto text-xs text-ink-faint">{meta}</p>}
        </CardBody>
      </Card>
    </Link>
  );
}
