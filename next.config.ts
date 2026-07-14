import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  images: {
    // Placeholder product images used by the seed data.
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
