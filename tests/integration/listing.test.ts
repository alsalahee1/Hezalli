// Listing engine (lib/search.ts) — verifies the SQL-paginated / lightweight-scan
// refactor preserves sort order, totals, and store scoping. Results are scoped to
// a freshly-created store (seller filter) so assertions are deterministic on the
// shared database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getListing } from "@/lib/search";

let storeSlug: string;
let sellerUserId: string;
let categoryId: string;
let storeId: string;
// Product ids by their price, in creation order (A=30 first … C=10 last).
let A: string;
let B: string;
let C: string;

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const u = await prisma.user.create({
    data: { email: `list-${uniq}@t.local`, roles: ["SELLER"], locale: "en" },
  });
  sellerUserId = u.id;
  const profile = await prisma.sellerProfile.create({
    data: { userId: u.id },
  });
  const store = await prisma.store.create({
    data: { sellerId: profile.id, name: "Listing Store", slug: `ls-${uniq}` },
  });
  storeId = store.id;
  storeSlug = store.slug;
  const cat = await prisma.category.create({
    data: { name: { en: "L", ar: "ل" }, slug: `lc-${uniq}` },
  });
  categoryId = cat.id;

  const mk = async (price: number, n: number) => {
    const p = await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: cat.id,
        title: { en: `P${n}`, ar: `م${n}` },
        slug: `lp-${uniq}-${n}`,
        basePrice: price,
        status: "ACTIVE",
        variants: {
          create: { sku: `ls-${uniq}-${n}`, name: "Default", price, stock: 5 },
        },
      },
    });
    return p.id;
  };
  A = await mk(30, 1);
  B = await mk(20, 2);
  C = await mk(10, 3);
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { storeId } }).catch(() => {});
  await prisma.category.delete({ where: { id: categoryId } }).catch(() => {});
  await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
  await prisma.user.delete({ where: { id: sellerUserId } }).catch(() => {});
});

const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id);

describe("getListing sort + pagination", () => {
  it("price_asc orders cheapest first", async () => {
    const r = await getListing({ seller: storeSlug, sort: "price_asc" }, "en");
    expect(r.total).toBe(3);
    expect(r.totalPages).toBe(1);
    expect(ids(r)).toEqual([C, B, A]);
  });

  it("price_desc orders most expensive first", async () => {
    const r = await getListing({ seller: storeSlug, sort: "price_desc" }, "en");
    expect(ids(r)).toEqual([A, B, C]);
  });

  it("newest orders by most recently created", async () => {
    const r = await getListing({ seller: storeSlug, sort: "newest" }, "en");
    expect(ids(r)).toEqual([C, B, A]);
  });

  it("scopes to the store and reports a correct total", async () => {
    const r = await getListing({ seller: storeSlug }, "en");
    expect(r.total).toBe(3);
    expect(r.items).toHaveLength(3);
    expect(new Set(ids(r))).toEqual(new Set([A, B, C]));
  });

  it("clamps an out-of-range page to the last page", async () => {
    const r = await getListing(
      { seller: storeSlug, sort: "newest", page: "99" },
      "en",
    );
    expect(r.page).toBe(1);
    expect(ids(r)).toEqual([C, B, A]);
  });
});
