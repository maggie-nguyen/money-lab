import type { Metadata } from "next";
import { createT } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/requestLocale";
import { FoodMapView } from "@/components/map/FoodMapView";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createT(locale);
  return {
    title: t("map.metaTitle"),
    description: t("map.metaDescription"),
  };
}

export default function BanDoPage() {
  return <FoodMapView mapsApiKey={process.env.GOOGLE_MAPS_API_KEY ?? ""} />;
}
