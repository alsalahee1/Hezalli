// Structured-data (JSON-LD) builders for rich search results. Pure functions;
// callers pass already-resolved, localized values.

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.AUTH_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");

/** Absolute, locale-prefixed URL for a path like "/product/foo". */
export function abs(locale: string, path: string): string {
  return `${SITE_URL}/${locale}${path}`;
}

export type ProductLd = {
  locale: string;
  slug: string;
  name: string;
  description: string;
  images: string[];
  sku: string | null;
  brand: string | null;
  lowPrice: number;
  highPrice: number;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
};

export function productJsonLd(p: ProductLd): Record<string, unknown> {
  const url = abs(p.locale, `/product/${p.slug}`);
  const availability = p.inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
  const offers =
    p.lowPrice === p.highPrice
      ? {
          "@type": "Offer",
          price: p.lowPrice.toFixed(2),
          priceCurrency: "USD",
          availability,
          url,
        }
      : {
          "@type": "AggregateOffer",
          lowPrice: p.lowPrice.toFixed(2),
          highPrice: p.highPrice.toFixed(2),
          priceCurrency: "USD",
          availability,
          url,
        };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description.slice(0, 500),
    image: p.images,
    ...(p.sku ? { sku: p.sku } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    offers,
    ...(p.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: p.ratingAvg.toFixed(1),
            reviewCount: p.ratingCount,
          },
        }
      : {}),
    url,
  };
}

export function breadcrumbJsonLd(
  locale: string,
  items: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: abs(locale, it.path),
    })),
  };
}

export function websiteJsonLd(locale: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Hezalli",
    url: abs(locale, ""),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: abs(locale, "/search?q={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Hezalli",
    url: SITE_URL,
  };
}
