import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * Two third parties are allowed in, and only those two: YouTube for lesson
 * videos, through the nocookie host so an embed does not set tracking cookies
 * on a minor, and Google Identity Services for sign-in.
 *
 * script-src keeps 'unsafe-inline' because Next inlines its hydration bootstrap
 * on every page. The alternative, a per-request nonce from middleware, forces
 * every route to render dynamically, which would cost us the statically
 * generated library pages. Next Fast Refresh additionally requires
 * 'unsafe-eval' in development, but it must never be enabled in production.
 */
const scriptSrc = process.env.NODE_ENV === "development"
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://maps.googleapis.com"
  : "script-src 'self' 'unsafe-inline' https://accounts.google.com https://maps.googleapis.com";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://accounts.google.com https://maps.googleapis.com https://maps.gstatic.com",
  "frame-src https://www.youtube-nocookie.com https://accounts.google.com",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2", "pino"],
  // Nothing gains from announcing the framework and version to a scanner.
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/chi-tieu", destination: "/vi-cua-toi", permanent: true },
      { source: "/chi-tieu/tam-ly", destination: "/vi-cua-toi/hieu-minh", permanent: true },
      { source: "/chi-tieu/hu-chi-tieu", destination: "/vi-cua-toi/chia-vi", permanent: true },
      { source: "/chi-tieu/an-uong", destination: "/vi-cua-toi/cuoc-song/an-uong", permanent: true },
      { source: "/chi-tieu/an-uong/spot/:spotId", destination: "/vi-cua-toi/cuoc-song/an-uong/spot/:spotId", permanent: true },
      { source: "/chi-tieu/an-uong/:slug", destination: "/vi-cua-toi/cuoc-song/an-uong/:slug", permanent: true },
      { source: "/vi-cua-toi/an-uong", destination: "/vi-cua-toi/cuoc-song/an-uong", permanent: true },
      { source: "/vi-cua-toi/an-uong/spot/:spotId", destination: "/vi-cua-toi/cuoc-song/an-uong/spot/:spotId", permanent: true },
      { source: "/vi-cua-toi/an-uong/:slug", destination: "/vi-cua-toi/cuoc-song/an-uong/:slug", permanent: true },
      { source: "/chi-tieu/thu-thach", destination: "/vi-cua-toi/thu-thach", permanent: true },
      { source: "/learn", destination: "/vi-cua-toi", permanent: false },
      { source: "/sims", destination: "/vi-cua-toi", permanent: false },
      { source: "/tools", destination: "/vi-cua-toi/chia-vi", permanent: false },
      { source: "/tutor", destination: "/vi-cua-toi", permanent: false },
      { source: "/shop", destination: "/vi-cua-toi", permanent: false },
      { source: "/quests", destination: "/vi-cua-toi/thu-thach", permanent: false },
      { source: "/leaderboard", destination: "/vi-cua-toi", permanent: false },
      { source: "/vi-cua-toi/cuoc-song/an-uong", destination: "/ban-do", permanent: true },
      { source: "/vi-cua-toi/cuoc-song/an-uong/spot/:spotId", destination: "/ban-do/spot/:spotId", permanent: true },
      { source: "/vi-cua-toi/cuoc-song/an-uong/:slug", destination: "/ban-do", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
