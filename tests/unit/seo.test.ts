import { describe, expect, it } from "vitest";

import {
  breadcrumbJsonLd,
  productJsonLd,
  websiteJsonLd,
  type ProductLd,
} from "@/lib/seo";

const base: ProductLd = {
  locale: "en",
  slug: "widget",
  name: "Widget",
  description: "A nice widget",
  images: ["https://img/1.jpg"],
  sku: "SKU1",
  brand: "Acme",
  lowPrice: 10,
  highPrice: 10,
  inStock: true,
  ratingAvg: 4.5,
  ratingCount: 8,
};

describe("productJsonLd", () => {
  it("emits a single Offer when the price is fixed", () => {
    const ld = productJsonLd(base) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Product");
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("Offer");
    expect(offers.price).toBe("10.00");
    expect(offers.priceCurrency).toBe("USD");
    expect(offers.availability).toBe("https://schema.org/InStock");
  });

  it("emits an AggregateOffer for a price range", () => {
    const ld = productJsonLd({ ...base, lowPrice: 10, highPrice: 25 });
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe("10.00");
    expect(offers.highPrice).toBe("25.00");
  });

  it("includes aggregateRating only when there are reviews", () => {
    expect(productJsonLd(base).aggregateRating).toBeDefined();
    expect(
      productJsonLd({ ...base, ratingCount: 0 }).aggregateRating,
    ).toBeUndefined();
  });

  it("marks out-of-stock products", () => {
    const ld = productJsonLd({ ...base, inStock: false });
    expect((ld.offers as Record<string, unknown>).availability).toBe(
      "https://schema.org/OutOfStock",
    );
  });

  it("omits brand/sku when absent", () => {
    const ld = productJsonLd({ ...base, brand: null, sku: null });
    expect(ld.brand).toBeUndefined();
    expect(ld.sku).toBeUndefined();
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers positions from 1 and builds absolute URLs", () => {
    const ld = breadcrumbJsonLd("en", [
      { name: "Home", path: "" },
      { name: "Cat", path: "/c/cat" },
    ]);
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0].position).toBe(1);
    expect(String(items[1].item)).toContain("/en/c/cat");
  });
});

describe("websiteJsonLd", () => {
  it("advertises a search action", () => {
    const ld = websiteJsonLd("en");
    expect(ld["@type"]).toBe("WebSite");
    const action = ld.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
  });
});
