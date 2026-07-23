import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The Content-Security-Policy is set per-request in middleware.ts so each HTML
// document carries a fresh script nonce (dropping 'unsafe-inline' for scripts).
// The remaining security headers stay here so they also cover /api routes and
// static assets, which the middleware matcher excludes.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Geolocation is allowed for our own origin (couriers share location; buyers
    // pin their delivery address); camera stays enabled for the driver QR
    // scanner via the same self allowance.
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(), geolocation=(self), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (`.next/standalone`) so the Docker
  // image can run the app without the full node_modules tree.
  output: "standalone",
  // Keep puppeteer-core external (not bundled) so its dynamic requires resolve
  // at runtime; it drives the system Chromium used for PDF generation.
  serverExternalPackages: ["puppeteer-core"],
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
