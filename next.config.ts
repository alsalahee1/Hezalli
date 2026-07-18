import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Baseline Content-Security-Policy. Next.js App Router injects inline bootstrap
// scripts and some inline styles, so 'unsafe-inline' is required there; images
// may come from the storage domain (https) or data URIs. Tighten with nonces in
// a later hardening pass if needed.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (`.next/standalone`) so the Docker
  // image can run the app without the full node_modules tree.
  output: "standalone",
  images: {
    // Placeholder product images used by the seed data.
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
