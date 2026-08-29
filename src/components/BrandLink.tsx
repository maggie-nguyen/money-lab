import Link from "next/link";
import { BrandMark, BrandWordmark } from "@/components/BrandMark";

export function BrandLink({
  href = "/",
  className,
  markSize = 24,
}: {
  href?: string;
  className?: string;
  markSize?: number;
}) {
  return (
    <Link
      href={href}
      className={className ?? "flex shrink-0 items-center gap-1.5 text-ink"}
    >
      <BrandMark size={markSize} />
      <BrandWordmark />
    </Link>
  );
}
