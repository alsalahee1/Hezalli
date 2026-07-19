// Step 17.7 — vacation mode hides a store's products from buyers.
// Exercises the real listing engine (lib/search) and the PDP visibility filter
// against local Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getListing } from "@/lib/search";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let storeSlug: string;

beforeAll(async () => {
  fx = await makeFixture();
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: fx.storeId },
    select: { slug: true },
  });
  storeSlug = store.slug;
});

afterAll(async () => {
  await fx.cleanup();
});

// A buyer-facing product query mirroring the PDP getProduct() visibility filter.
function visibleOnPdp() {
  return prisma.product.findFirst({
    where: {
      id: fx.productId,
      status: "ACTIVE",
      store: { status: "ACTIVE", isOnVacation: false },
    },
    select: { id: true },
  });
}

describe("vacation mode", () => {
  it("lists the store's product while active", async () => {
    const res = await getListing({ seller: storeSlug }, "en");
    expect(res.items.map((i) => i.id)).toContain(fx.productId);
    expect(await visibleOnPdp()).not.toBeNull();
  });

  it("hides all products once the store is on vacation", async () => {
    await prisma.store.update({
      where: { id: fx.storeId },
      data: { isOnVacation: true, vacationMessage: "Back on July 25" },
    });

    const res = await getListing({ seller: storeSlug }, "en");
    expect(res.items.map((i) => i.id)).not.toContain(fx.productId);
    expect(res.total).toBe(0);
    expect(await visibleOnPdp()).toBeNull();
  });

  it("shows products again when vacation ends", async () => {
    await prisma.store.update({
      where: { id: fx.storeId },
      data: { isOnVacation: false, vacationMessage: null },
    });

    const res = await getListing({ seller: storeSlug }, "en");
    expect(res.items.map((i) => i.id)).toContain(fx.productId);
    expect(await visibleOnPdp()).not.toBeNull();
  });
});
