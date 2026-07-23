// COD reconciliation: delivering accrues cash + earnings to the courier's
// ledger; admin remittances reduce cash-on-hand. Against local Postgres.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<typeof import("next-intl/server")>()),
  getLocale: vi.fn().mockResolvedValue("en"),
}));

import { courierAdvance } from "@/lib/actions/courier";
import { recordRemittance } from "@/lib/actions/courier-ledger";
import { courierCashSummary } from "@/lib/courier-ledger";
import { markSubOrderDelivered } from "@/lib/shipment-core";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

const form = (data: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
};

let fx: Awaited<ReturnType<typeof makeFixture>>;
let adminId: string;
const userIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const admin = await prisma.user.create({
    data: {
      email: `adm-${Date.now().toString(36)}@t.local`,
      roles: ["ADMIN"],
      locale: "en",
    },
  });
  adminId = admin.id;
  userIds.push(admin.id);
});

afterAll(async () => {
  await prisma.auditLog
    .deleteMany({ where: { actorId: { in: userIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
  await fx.cleanup();
});

// A fresh courier per test keeps ledger sums absolute (no cross-test bleed).
async function freshCourier() {
  const c = await prisma.user.create({
    data: {
      email: `crr-${Math.random().toString(36).slice(2)}@t.local`,
      roles: ["COURIER"],
      locale: "en",
    },
  });
  userIds.push(c.id);
  return c.id;
}

async function assignedParcel(courierId: string, paymentMethod: string) {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: paymentMethod as never,
    status: "SHIPPED",
  });
  const shipment = await prisma.shipment.create({
    data: {
      subOrderId,
      status: "OUT_FOR_DELIVERY",
      platformManaged: true,
      driverId: courierId,
      shippedAt: new Date(),
    },
    select: { id: true },
  });
  return { subOrderId, shipmentId: shipment.id };
}

describe("delivery accrues the courier ledger", () => {
  it("COD delivery records collected cash + a delivery-fee earning", async () => {
    const courierId = await freshCourier();
    const { shipmentId } = await assignedParcel(courierId, "COD");

    as(courierId);
    expect(
      await courierAdvance(shipmentId, "DELIVERED", { recipientName: "Ali" }),
    ).toEqual({ ok: true });

    const s = await courierCashSummary(courierId);
    expect(s.totalCollected).toBe(100); // price 100, no shipping/discount
    expect(s.cashOnHand).toBe(100);
    expect(s.earnings).toBe(1.5); // default courier_delivery_fee
    expect(s.totalRemitted).toBe(0);
  });

  it("prepaid delivery earns a fee but collects no cash", async () => {
    const courierId = await freshCourier();
    const { shipmentId } = await assignedParcel(courierId, "HEZALLI_BALANCE");

    as(courierId);
    expect(await courierAdvance(shipmentId, "DELIVERED")).toEqual({ ok: true });

    const s = await courierCashSummary(courierId);
    expect(s.totalCollected).toBe(0);
    expect(s.cashOnHand).toBe(0);
    expect(s.earnings).toBe(1.5);
  });

  it("concurrent DELIVERED submits mint only one earning (C2 race guard)", async () => {
    const courierId = await freshCourier();
    const { subOrderId } = await assignedParcel(courierId, "HEZALLI_BALANCE");
    const proof = { courierId };

    // Two near-simultaneous "delivered" submits for one parcel. The atomic
    // SHIPPED→DELIVERED claim (plus the partial-unique ledger index) must let
    // at most one accrue the delivery fee — never two.
    const results = await Promise.allSettled([
      markSubOrderDelivered(subOrderId, "courier", "en", proof),
      markSubOrderDelivered(subOrderId, "courier", "en", proof),
    ]);
    const oks = results.filter(
      (r) => r.status === "fulfilled" && (r.value as { ok?: boolean }).ok,
    ).length;
    expect(oks).toBe(1);

    const earnings = await prisma.courierLedgerEntry.count({
      where: { subOrderId, type: "EARNING" },
    });
    expect(earnings).toBe(1);
    const s = await courierCashSummary(courierId);
    expect(s.earnings).toBe(1.5); // a single fee, not 3.0
  });

  it("a seller-marked delivery accrues nothing to any courier ledger", async () => {
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    // A seller only ever delivers a THIRD-PARTY parcel (platform-managed ones
    // are blocked upstream and refused by the money safety net). Its COD is the
    // seller's own cash, off-platform — so no courier ledger row is written.
    await prisma.shipment.create({
      data: { subOrderId, status: "OUT_FOR_DELIVERY", platformManaged: false },
    });
    expect(await markSubOrderDelivered(subOrderId, "seller", "en")).toEqual({
      ok: true,
    });
    const count = await prisma.courierLedgerEntry.count({
      where: { subOrderId },
    });
    expect(count).toBe(0);
  });
});

describe("recordRemittance", () => {
  it("reduces cash-on-hand and is admin-only", async () => {
    const courierId = await freshCourier();
    const { shipmentId } = await assignedParcel(courierId, "COD");
    as(courierId);
    await courierAdvance(shipmentId, "DELIVERED", { recipientName: "Ali" }); // cashOnHand = 100

    // A courier cannot record their own remittance.
    as(courierId);
    expect(await recordRemittance(form({ courierId, amount: "60" }))).toEqual({
      error: "forbidden",
    });

    // Admin records a 60 hand-in → 40 remaining.
    as(adminId);
    expect(
      await recordRemittance(form({ courierId, amount: "60", note: "cash" })),
    ).toEqual({ ok: true });

    const s = await courierCashSummary(courierId);
    expect(s.cashOnHand).toBe(40);
    expect(s.totalRemitted).toBe(60);
    expect(s.totalCollected).toBe(100); // unchanged
  });

  it("rejects a non-positive remittance", async () => {
    const courierId = await freshCourier();
    as(adminId);
    expect(await recordRemittance(form({ courierId, amount: "0" }))).toEqual({
      error: "badInput",
    });
    expect(await recordRemittance(form({ courierId, amount: "-5" }))).toEqual({
      error: "badInput",
    });
  });

  it("applies a signed adjustment", async () => {
    const courierId = await freshCourier();
    as(adminId);
    expect(
      await recordRemittance(
        form({ courierId, kind: "adjustment", amount: "-10", note: "short" }),
      ),
    ).toEqual({ ok: true });
    const s = await courierCashSummary(courierId);
    expect(s.cashOnHand).toBe(-10);
  });
});
