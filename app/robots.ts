import type { MetadataRoute } from "next";

const base =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.AUTH_URL ??
  "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private/authenticated and machine-only areas stay out of the index.
        disallow: [
          "/api/",
          "/*/admin",
          "/*/seller",
          "/*/account",
          "/*/checkout",
          "/*/cart",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
