import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { quoteShippingForStores } from "@/lib/shipping";
import { makeFixture } from "./factory";

// Known platform settings this suite depends on. Captured/restored around the
// run so it's deterministic regardless of what's seeded in the test DB.
const SETTINGS: Record<string, number | boolean> = {
  default_shipping_fee: 5,
  free_shipping_over: 100,
  default_express_fee: 10,
  express_enabled: true,
  std_eta_min_days: 3,
  std_eta_max_days: 7,
  express_eta_min_days: 1,
  express_eta_max_days: 2,
};

let saved: Record<string, unknown> = {};

async function setSetting(key: string, value: unknown) {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });
}

let gseq = 0;
const uniqueGov = () => `TESTGOV-${Date.now().toString(36)}-${++gseq}`;

// Build a zone that serves `gov` plus an optional store rate; returns a cleanup.
async function withZone(
  gov: string,
  storeId: string,
  rate: { feeUsd: number; freeOver?: number; expressFeeUsd?: number } | null,
) {
  const zone = await prisma.shippingZone.create({
    data: { name: gov, governorates: [gov] },
  });
  if (rate) {
    await prisma.shippingRate.create({
      data: {
        storeId,
        zoneId: zone.id,
        feeUsd: rate.feeUsd,
        freeOver: rate.freeOver ?? null,
        expressFeeUsd: rate.expressFeeUsd ?? null,
      },
    });
  }
  return async () => {
    await prisma.shippingRate.deleteMany({ where: { zoneId: zone.id } });
    await prisma.shippingZone
      .delete({ where: { id: zone.id } })
      .catch(() => {});
  };
}

beforeAll(async () => {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: Object.keys(SETTINGS) } },
    select: { key: true, value: true },
  });
  saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  for (const [k, v] of Object.entries(SETTINGS)) await setSetting(k, v);
});

afterAll(async () => {
  for (const k of Object.keys(SETTINGS)) {
    if (k in saved) await setSetting(k, saved[k]);
    else
      await prisma.platformSetting
        .delete({ where: { key: k } })
        .catch(() => {});
  }
});

describe("quoteShippingForStores — express tier", () => {
  it("quotes the store's own standard + express rate with ETAs", async () => {
    const fx = await makeFixture();
    const gov = uniqueGov();
    const cleanupZone = await withZone(gov, fx.storeId, {
      feeUsd: 4,
      freeOver: 50,
      expressFeeUsd: 9,
    });
    try {
      const q = await quoteShippingForStores(gov, [
        { storeId: fx.storeId, subtotal: 20 },
      ]);
      const o = q.get(fx.storeId)!;
      expect(o.standard.fee).toBe(4);
      expect(o.standard.etaMinDays).toBe(3);
      expect(o.standard.etaMaxDays).toBe(7);
      expect(o.express).not.toBeNull();
      expect(o.express!.fee).toBe(9);
      expect(o.express!.etaMinDays).toBe(1);
      expect(o.express!.etaMaxDays).toBe(2);
    } finally {
      await cleanupZone();
      await fx.cleanup();
    }
  });

  it("waives the standard fee over the threshold but still charges express", async () => {
    const fx = await makeFixture();
    const gov = uniqueGov();
    const cleanupZone = await withZone(gov, fx.storeId, {
      feeUsd: 4,
      freeOver: 50,
      expressFeeUsd: 9,
    });
    try {
      const q = await quoteShippingForStores(gov, [
        { storeId: fx.storeId, subtotal: 60 }, // ≥ freeOver
      ]);
      const o = q.get(fx.storeId)!;
      expect(o.standard.fee).toBe(0); // waived
      expect(o.express!.fee).toBe(9); // express is never waived
    } finally {
      await cleanupZone();
      await fx.cleanup();
    }
  });

  it("falls back to the platform default fees when the store has no rate", async () => {
    const fx = await makeFixture();
    const gov = uniqueGov();
    const cleanupZone = await withZone(gov, fx.storeId, null);
    try {
      const q = await quoteShippingForStores(gov, [
        { storeId: fx.storeId, subtotal: 20 },
      ]);
      const o = q.get(fx.storeId)!;
      expect(o.standard.fee).toBe(SETTINGS.default_shipping_fee);
      expect(o.express!.fee).toBe(SETTINGS.default_express_fee);
    } finally {
      await cleanupZone();
      await fx.cleanup();
    }
  });

  it("omits the express option when express is disabled platform-wide", async () => {
    const fx = await makeFixture();
    const gov = uniqueGov();
    const cleanupZone = await withZone(gov, fx.storeId, {
      feeUsd: 4,
      expressFeeUsd: 9,
    });
    await setSetting("express_enabled", false);
    try {
      const q = await quoteShippingForStores(gov, [
        { storeId: fx.storeId, subtotal: 20 },
      ]);
      const o = q.get(fx.storeId)!;
      expect(o.standard.fee).toBe(4);
      expect(o.express).toBeNull();
    } finally {
      await setSetting("express_enabled", true); // restore for later tests
      await cleanupZone();
      await fx.cleanup();
    }
  });
});
