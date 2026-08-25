import type { MetadataRoute } from "next";
import { env } from "@/server/config";

/**
 * The library is the only surface built for search traffic. Everything behind a
 * session, plus the API itself, is disallowed: crawling it would only produce a
 * wall of redirects to the login page.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = env().APP_ORIGIN;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/learn", "/lesson", "/course", "/sims", "/tools", "/quests", "/shop", "/profile", "/settings", "/leaderboard", "/welcome", "/verify"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
