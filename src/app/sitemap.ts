import type { MetadataRoute } from "next";
import { env } from "@/server/config";
import { ROUTES } from "@/lib/routes";
import { publishedArticleSitemapEntries } from "@/server/services/libraryService";

/** Regenerated on the same cadence as the library pages themselves. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = env().APP_ORIGIN;

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}${ROUTES.food}`, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}${ROUTES.library}`, changeFrequency: "daily", priority: 0.8 },
    { url: `${origin}/login`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/signup`, changeFrequency: "yearly", priority: 0.3 },
  ];

  let articles: MetadataRoute.Sitemap = [];
  try {
    const rows = await publishedArticleSitemapEntries();
    articles = rows.map((a) => ({
      url: `${origin}/library/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch {
    // A build or a request with no reachable database still serves the static
    // half rather than a 500, and the next revalidation picks the articles up.
  }

  return [...staticEntries, ...articles];
}
