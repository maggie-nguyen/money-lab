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
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["@node-rs/argon2", "pino"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
