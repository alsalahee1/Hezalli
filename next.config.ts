import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (`.next/standalone`) so the Docker
  // image can run the app without the full node_modules tree.
  output: "standalone",
  images: {
    // Placeholder product images used by the seed data.
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
