// COD credit control (docs/DELIVERY-POINTS.md §32): drivers over the cash
// limit or sitting on overdue COD stop receiving assignments; earnings can be
// netted against the cash they hold; points over their cash limit stop
// receiving routing/cash-ins and have payouts withheld against held cash.
// Uses the setting defaults: driver_cash_limit 50, driver_cod_max_age_hours
// 24, point_cash_limit 200. Boundaries mocked: auth(), revalidatePath,
// getLocale.
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

import {
  cashBlockedPointIds,
  codBlockedCourierIds,
  courierCodStatus,
} from "@/lib/cod-guard";
import { autoAssignShipment } from "@/lib/courier-assign";
import {
  offsetEarningsAgainstCod,
  recordEarningsPayout,
  recordRemittance,
} from "@/lib/actions/courier-ledger";
import { setCourierDeposit, setPointDeposit } from "@/lib/actions/deposit";
import { pointDriverCashIn } from "@/lib/actions/point";
import { requestPointPayout } from "@/lib/actions/point-payout";
import {
  approveRemitClaim,
  rejectRemitClaim,
  submitCourierRemitClaim,
  submitPointRemitClaim,
} from "@/lib/actions/remit-claim";
import { payCodWithWallet } from "@/lib/actions/pay-cod";
import { setWalletCodHold } from "@/lib/actions/wallet-hold";
import { courierCashSummary } from "@/lib/courier-ledger";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { checkPointRoutable } from "@/lib/point-select";
import { markSubOrderDelivered } from "@/lib/shipment-core";
import { prisma } from "@/lib/prisma";
import { transferFunds } from "@/lib/wallet-transfers";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);
const form = (data: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
};
const HOURS = 3600_000;

let fx: Awaited<ReturnType<typeof makeFixture>>;
let adminId: string;
const userIds: string[] = [];

async function makeCourier(tag: string): Promise<string> {
  const c = await prisma.user.create({
    data: {
      email: `cg-${tag}-${Math.random().toString(36).slice(2)}@t.local`,
      roles: ["COURIER"],
      locale: "en",
    },
  });
  userIds.push(c.id);
  return c.id;
}

async function makePoint(tag: string) {
  const owner = await prisma.user.create({
    data: {
      email: `cg-${tag}-${Math.random().toString(36).slice(2)}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  userIds.push(owner.id);
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `CG ${tag}`,
      phone: "770000001",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Street 1",
    },
  });
  return { ownerId: owner.id, pointId: point.id };
}

beforeAll(async () => {
  fx = await makeFixture();
  const admin = await prisma.user.create({
    data: {
      email: `cg-adm-${Date.now().toString(36)}@t.local`,
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
  await prisma.courierLedgerEntry
    .deleteMany({ where: { courierId: { in: userIds } } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await prisma.pointPayoutRequest
    .deleteMany({ where: { point: { ownerId: { in: userIds } } } })
    .catch(() => {});
  await prisma.remitClaim
    .deleteMany({
      where: {
        OR: [
          { courierId: { in: userIds } },
          { point: { ownerId: { in: userIds } } },
        ],
      },
    })
    .catch(() => {});
  await prisma.deliveryPointLedgerEntry
    .deleteMany({ where: { point: { ownerId: { in: userIds } } } })
    .catch(() => {});
  await prisma.deliveryPoint
    .deleteMany({ where: { ownerId: { in: userIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
  await fx.cleanup();
});

describe("codBlockedCourierIds", () => {
  it("blocks over the cash limit, not under it", async () => {
    const over = await makeCourier("over");
    const under = await makeCourier("under");
    await prisma.courierLedgerEntry.createMany({
      data: [
        { courierId: over, type: "COD_COLLECTED", amountUsd: 60 },
        { courierId: under, type: "COD_COLLECTED", amountUsd: 20 },
      ],
    });
    const blocked = await codBlockedCourierIds([over, under]);
    expect(blocked.has(over)).toBe(true);
    expect(blocked.has(under)).toBe(false);
  });

  it("blocks overdue cash FIFO: remittances settle the oldest first", async () => {
    const aged = await makeCourier("aged");
    // $30 collected two days ago; only $10 remitted since → $20 of old cash
    // still unsettled → blocked, even though $20 is under the amount limit.
    await prisma.courierLedgerEntry.create({
      data: {
        courierId: aged,
        type: "COD_COLLECTED",
        amountUsd: 30,
        createdAt: new Date(Date.now() - 48 * HOURS),
      },
    });
    await prisma.courierLedgerEntry.create({
      data: { courierId: aged, type: "REMITTANCE", amountUsd: -10 },
    });
    expect((await codBlockedCourierIds([aged])).has(aged)).toBe(true);

    const status = await courierCodStatus(aged);
    expect(status.blocked).toBe(true);
    expect(status.reason).toBe("overdue");
    expect(status.oldestUnpaidAt!.getTime()).toBeLessThan(
      Date.now() - 47 * HOURS,
    );

    // Settling the rest clears the block.
    await prisma.courierLedgerEntry.create({
      data: { courierId: aged, type: "REMITTANCE", amountUsd: -20 },
    });
    expect((await codBlockedCourierIds([aged])).has(aged)).toBe(false);
    expect((await courierCodStatus(aged)).blocked).toBe(false);
  });

  it("fresh COD within limits blocks nothing", async () => {
    const fresh = await makeCourier("fresh");
    await prisma.courierLedgerEntry.create({
      data: { courierId: fresh, type: "COD_COLLECTED", amountUsd: 40 },
    });
    expect((await codBlockedCourierIds([fresh])).has(fresh)).toBe(false);
  });
});

describe("auto-assignment under COD control", () => {
  it("never hands a parcel to a blocked driver", async () => {
    const blocked = await makeCourier("blk");
    await makeCourier("ok"); // a clean driver must exist to win the pick
    await prisma.courierLedgerEntry.create({
      data: { courierId: blocked, type: "COD_COLLECTED", amountUsd: 500 },
    });

    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    const s = await prisma.shipment.create({
      data: {
        subOrderId,
        status: "IN_TRANSIT",
        platformManaged: true,
        shippedAt: new Date(),
      },
      select: { id: true },
    });
    const chosen = await autoAssignShipment(s.id);
    expect(chosen).toBeTruthy();
    expect(chosen).not.toBe(blocked);
  });
});

describe("earnings vs COD netting", () => {
  it("withholds payouts while cash is outstanding and offsets atomically", async () => {
    const c = await makeCourier("net");
    await prisma.courierLedgerEntry.createMany({
      data: [
        { courierId: c, type: "COD_COLLECTED", amountUsd: 15 },
        { courierId: c, type: "EARNING", amountUsd: 40 },
      ],
    });

    as(adminId);
    // Cash first: no earnings leave while the driver holds Hezalli's money.
    expect(
      await recordEarningsPayout(form({ courierId: c, amount: "40" })),
    ).toEqual({ error: "cashOutstanding" });

    // Offset settles min(cash, earnings) with no money moving.
    expect(await offsetEarningsAgainstCod(form({ courierId: c }))).toEqual({
      ok: true,
      offset: 15,
    });
    const s = await courierCashSummary(c);
    expect(s.cashOnHand).toBe(0);
    expect(s.earnings).toBe(25); // 40 − 15
    expect(s.totalRemitted).toBe(15);

    // Nothing left to offset; the remaining earnings now pay out normally.
    expect(await offsetEarningsAgainstCod(form({ courierId: c }))).toEqual({
      error: "nothingToOffset",
    });
    expect(
      await recordEarningsPayout(form({ courierId: c, amount: "25" })),
    ).toEqual({ ok: true });
    expect((await courierCashSummary(c)).earnings).toBe(0);
  });
});

describe("point cash limit", () => {
  it("takes an over-limit point out of routing and refuses cash-ins", async () => {
    const { ownerId, pointId } = await makePoint("hot");
    await prisma.deliveryPointLedgerEntry.create({
      data: { pointId, type: "COD_COLLECTED", amountUsd: 250 },
    });
    expect((await cashBlockedPointIds([pointId])).has(pointId)).toBe(true);
    expect(await checkPointRoutable(pointId)).toBe("unavailable");

    const driver = await makeCourier("cashin");
    await prisma.courierLedgerEntry.create({
      data: { courierId: driver, type: "COD_COLLECTED", amountUsd: 30 },
    });
    as(ownerId);
    expect(await pointDriverCashIn(driver, 10)).toEqual({
      error: "cashLimit",
    });
  });

  it("stays routable under the limit", async () => {
    const { pointId } = await makePoint("cool");
    await prisma.deliveryPointLedgerEntry.create({
      data: { pointId, type: "COD_COLLECTED", amountUsd: 150 },
    });
    expect((await cashBlockedPointIds([pointId])).has(pointId)).toBe(false);
    expect(await checkPointRoutable(pointId)).toBe("ok");
  });

  it("withholds payout requests against unremitted cash", async () => {
    const { ownerId, pointId } = await makePoint("pay");
    await prisma.deliveryPointLedgerEntry.createMany({
      data: [
        { pointId, type: "HANDLING_FEE", amountUsd: 50 },
        { pointId, type: "COD_COLLECTED", amountUsd: 20 },
      ],
    });
    as(ownerId);
    // Free balance is 50 − 20 held cash = 30.
    expect(await requestPointPayout(40)).toEqual({ error: "cashOutstanding" });
    expect(await requestPointPayout(25)).toEqual({ ok: true });
  });
});

describe("deposits & trust bonus raise the personal limit", () => {
  it("a deposit covers cash the base limit would block", async () => {
    const c = await makeCourier("dep");
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "COD_COLLECTED", amountUsd: 60 },
    });
    expect((await codBlockedCourierIds([c])).has(c)).toBe(true); // base 50

    as(adminId);
    expect(
      await setCourierDeposit(form({ courierId: c, amount: "20" })),
    ).toEqual({ ok: true });
    // Limit is now 50 + 20 = 70 ≥ 60 held.
    expect((await codBlockedCourierIds([c])).has(c)).toBe(false);

    const status = await courierCodStatus(c);
    expect(status.deposit).toBe(20);
    expect(status.cashLimit).toBe(70);
    expect(status.blocked).toBe(false);
  });

  it("delivery history earns limit: 45 deliveries → two $10 steps", async () => {
    const c = await makeCourier("trust");
    await prisma.courierLedgerEntry.createMany({
      data: Array.from({ length: 45 }, () => ({
        courierId: c,
        type: "EARNING" as const,
        amountUsd: 1.5,
      })),
    });
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "COD_COLLECTED", amountUsd: 65 },
    });
    // Limit = 50 base + floor(45/20)*10 = 70 ≥ 65 → not blocked.
    expect((await codBlockedCourierIds([c])).has(c)).toBe(false);
    const status = await courierCodStatus(c);
    expect(status.trustBonus).toBe(20);
    expect(status.deliveries).toBe(45);
    expect(status.cashLimit).toBe(70);

    // But history is not a blank cheque — $75 still trips the limit.
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "COD_COLLECTED", amountUsd: 10 },
    });
    expect((await codBlockedCourierIds([c])).has(c)).toBe(true);
  });

  it("a point deposit raises its cash holding limit 1:1", async () => {
    const { pointId } = await makePoint("pdep");
    await prisma.deliveryPointLedgerEntry.create({
      data: { pointId, type: "COD_COLLECTED", amountUsd: 250 },
    });
    expect((await cashBlockedPointIds([pointId])).has(pointId)).toBe(true);

    as(adminId);
    expect(await setPointDeposit(form({ pointId, amount: "100" }))).toEqual({
      ok: true,
    });
    // Limit is now 200 + 100 = 300 ≥ 250 held.
    expect((await cashBlockedPointIds([pointId])).has(pointId)).toBe(false);
    expect(await checkPointRoutable(pointId)).toBe("ok");
  });

  it("guards deposit updates: admin-only, non-negative, real target", async () => {
    const c = await makeCourier("guard");
    as(c); // not an admin
    expect(
      await setCourierDeposit(form({ courierId: c, amount: "10" })),
    ).toEqual({ error: "forbidden" });

    as(adminId);
    expect(
      await setCourierDeposit(form({ courierId: c, amount: "-5" })),
    ).toEqual({ error: "badInput" });
    expect(
      await setCourierDeposit(form({ courierId: adminId, amount: "10" })),
    ).toEqual({ error: "notCourier" });
    expect(
      await setPointDeposit(form({ pointId: "nope", amount: "10" })),
    ).toEqual({ error: "notPoint" });

    // Audited: the change writes an audit row with previous → new.
    expect(
      await setCourierDeposit(form({ courierId: c, amount: "30", note: "r1" })),
    ).toEqual({ ok: true });
    const audit = await prisma.auditLog.findFirst({
      where: { action: "courier.deposit", entityId: c },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });
});

describe("wallet COD hold (pledged collateral)", () => {
  async function courierWithWallet(tag: string, balance: number) {
    const c = await makeCourier(tag);
    const wallet = await prisma.wallet.create({
      data: { userId: c, availableUsd: balance },
      select: { id: true },
    });
    // Back the balance with a real ledger entry so recomputes stay truthful.
    await prisma.walletEntry.create({
      data: { walletId: wallet.id, type: "TOP_UP", amountUsd: balance },
    });
    return { courierId: c, walletId: wallet.id };
  }

  it("a pledge raises the limit; an unbacked pledge counts for nothing", async () => {
    const { courierId: c } = await courierWithWallet("hold", 100);
    as(c);
    expect(await setWalletCodHold(form({ amount: "40" }))).toEqual({
      ok: true,
    });

    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "COD_COLLECTED", amountUsd: 80 },
    });
    // Limit = 50 base + 40 pledge = 90 ≥ 80 → not blocked.
    expect((await codBlockedCourierIds([c])).has(c)).toBe(false);
    const status = await courierCodStatus(c);
    expect(status.walletHold).toBe(40);
    expect(status.cashLimit).toBe(90);

    // $95 held is over even the pledged limit.
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "COD_COLLECTED", amountUsd: 15 },
    });
    expect((await codBlockedCourierIds([c])).has(c)).toBe(true);
  });

  it("rejects a pledge the balance doesn't cover", async () => {
    const { courierId: c } = await courierWithWallet("thin", 30);
    as(c);
    expect(await setWalletCodHold(form({ amount: "50" }))).toEqual({
      error: "insufficient",
    });
  });

  it("pledged money cannot leave the wallet", async () => {
    const { courierId: c } = await courierWithWallet("lock", 100);
    const other = await makeCourier("rcpt");
    as(c);
    expect(await setWalletCodHold(form({ amount: "40" }))).toEqual({
      ok: true,
    });

    // 50 + 40 hold = 90 ≤ 100 → allowed; balance recomputes to 50.
    expect((await transferFunds(c, other, 50)).ok).toBe(true);
    // 20 + 40 hold = 60 > 50 → the pledge blocks it.
    expect(await transferFunds(c, other, 20)).toEqual({
      error: "insufficient",
    });
  });

  it("releasing the pledge requires empty pockets", async () => {
    const { courierId: c } = await courierWithWallet("rel", 60);
    as(c);
    expect(await setWalletCodHold(form({ amount: "60" }))).toEqual({
      ok: true,
    });
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "COD_COLLECTED", amountUsd: 25 },
    });
    expect(await setWalletCodHold(form({ amount: "0" }))).toEqual({
      error: "cashHeld",
    });

    // Hand the cash in → release is allowed again.
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "REMITTANCE", amountUsd: -25 },
    });
    expect(await setWalletCodHold(form({ amount: "0" }))).toEqual({
      ok: true,
    });
    expect((await courierCodStatus(c)).walletHold).toBe(0);
  });
});

describe("delivery-manager staff access", () => {
  it("a DELIVERY_MANAGER can run the COD money ops (not admin-only)", async () => {
    const dm = await prisma.user.create({
      data: {
        email: `cg-dm-${Date.now().toString(36)}@t.local`,
        roles: ["DELIVERY_MANAGER"],
        locale: "en",
      },
    });
    userIds.push(dm.id);
    const c = await makeCourier("dmops");
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "COD_COLLECTED", amountUsd: 12 },
    });

    as(dm.id);
    expect(
      await setCourierDeposit(form({ courierId: c, amount: "10" })),
    ).toEqual({ ok: true });
    expect(
      await recordRemittance(form({ courierId: c, amount: "12" })),
    ).toEqual({ ok: true });
    expect((await courierCashSummary(c)).cashOnHand).toBe(0);

    const { pointId } = await makePoint("dmpt");
    expect(await setPointDeposit(form({ pointId, amount: "50" }))).toEqual({
      ok: true,
    });
  });
});

describe("digital remittance claims", () => {
  it("courier claim: submit → staff approve settles the ledger", async () => {
    const c = await makeCourier("remit");
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "COD_COLLECTED", amountUsd: 45 },
    });

    as(c);
    // Guard rails first: over-claim and bad reference are refused.
    expect(
      await submitCourierRemitClaim(
        form({ amount: "46", method: "JAWALI", reference: "TX-1" }),
      ),
    ).toEqual({ error: "overRemit" });
    expect(
      await submitCourierRemitClaim(
        form({ amount: "45", method: "JAWALI", reference: "x" }),
      ),
    ).toEqual({ error: "badInput" });
    expect(
      await submitCourierRemitClaim(
        form({ amount: "45", method: "JAWALI", reference: "TX-100" }),
      ),
    ).toEqual({ ok: true });
    // One open claim at a time.
    expect(
      await submitCourierRemitClaim(
        form({ amount: "1", method: "JAIB", reference: "TX-101" }),
      ),
    ).toEqual({ error: "alreadyOpen" });

    const claim = await prisma.remitClaim.findFirstOrThrow({
      where: { courierId: c, status: "PENDING" },
    });
    as(c); // a courier cannot approve their own claim
    expect(await approveRemitClaim(claim.id)).toEqual({ error: "forbidden" });

    as(adminId);
    expect(await approveRemitClaim(claim.id)).toEqual({ ok: true });
    expect((await courierCashSummary(c)).cashOnHand).toBe(0);
    // Idempotent: a second approve cannot double-settle.
    expect(await approveRemitClaim(claim.id)).toEqual({ error: "badState" });
  });

  it("approve re-checks cash at decision time", async () => {
    const c = await makeCourier("stale");
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "COD_COLLECTED", amountUsd: 30 },
    });
    as(c);
    expect(
      await submitCourierRemitClaim(
        form({ amount: "30", method: "KURAIMI", reference: "TX-200" }),
      ),
    ).toEqual({ ok: true });

    // The cash was settled another way (office hand-in) before review.
    await prisma.courierLedgerEntry.create({
      data: { courierId: c, type: "REMITTANCE", amountUsd: -25 },
    });
    const claim = await prisma.remitClaim.findFirstOrThrow({
      where: { courierId: c, status: "PENDING" },
    });
    as(adminId);
    expect(await approveRemitClaim(claim.id)).toEqual({ error: "overRemit" });
    // Rejecting keeps the ledger untouched and notes the reason.
    expect(await rejectRemitClaim(claim.id, "already handed in")).toEqual({
      ok: true,
    });
    expect((await courierCashSummary(c)).cashOnHand).toBe(5);
  });

  it("point claim settles the hub's cash side", async () => {
    const { ownerId, pointId } = await makePoint("remit");
    await prisma.deliveryPointLedgerEntry.create({
      data: { pointId, type: "COD_COLLECTED", amountUsd: 80 },
    });
    as(ownerId);
    expect(
      await submitPointRemitClaim(
        form({ amount: "80", method: "BANK", reference: "TX-300" }),
      ),
    ).toEqual({ ok: true });

    const claim = await prisma.remitClaim.findFirstOrThrow({
      where: { pointId, status: "PENDING" },
    });
    as(adminId);
    expect(await approveRemitClaim(claim.id)).toEqual({ ok: true });
    expect((await pointLedgerSummary(pointId)).cashOnHand).toBe(0);
  });
});

describe("doorstep wallet payment for COD", () => {
  it("buyer pays from wallet → payment CONFIRMED, driver collects nothing", async () => {
    // Buyer wallet holding $150, backed by a real ledger entry.
    const wallet = await prisma.wallet.upsert({
      where: { userId: fx.buyerId },
      create: { userId: fx.buyerId, availableUsd: 150 },
      update: { availableUsd: 150 },
      select: { id: true },
    });
    await prisma.walletEntry.create({
      data: { walletId: wallet.id, type: "TOP_UP", amountUsd: 150 },
    });

    const { orderId, subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    const driver = await makeCourier("door");
    await prisma.shipment.create({
      data: {
        subOrderId,
        status: "OUT_FOR_DELIVERY",
        platformManaged: true,
        shippedAt: new Date(),
        driverId: driver,
      },
    });

    as(fx.buyerId);
    expect(await payCodWithWallet(orderId)).toEqual({ ok: true });
    // $150 − $100 order, balance recomputed from the ledger.
    const after = await prisma.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
      select: { availableUsd: true },
    });
    expect(Number(after.availableUsd)).toBe(50);
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId },
      select: { status: true, confirmedBy: true },
    });
    expect(payment.status).toBe("CONFIRMED");
    expect(payment.confirmedBy).toBe("buyer:wallet");
    // The assigned driver is told to collect nothing.
    expect(
      await prisma.notification.findFirst({
        where: { userId: driver, title: { contains: "paid digitally" } },
      }),
    ).toBeTruthy();

    // Double-pay refused.
    expect(await payCodWithWallet(orderId)).toEqual({ error: "alreadyPaid" });

    // Delivery: the driver earns their fee but takes NO cash accountability.
    expect(
      await markSubOrderDelivered(subOrderId, "courier", "en", {
        courierId: driver,
      }),
    ).toEqual({ ok: true });
    const cash = await courierCashSummary(driver);
    expect(cash.cashOnHand).toBe(0);
    expect(cash.totalCollected).toBe(0);
    expect(cash.earnings).toBeGreaterThan(0);
  });

  it("refuses when the balance can't cover it or money already moved", async () => {
    // Balance is $50 after the previous test; a fresh $100 COD order won't fit.
    const { orderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    as(fx.buyerId);
    expect(await payCodWithWallet(orderId)).toEqual({ error: "insufficient" });

    // A sub-order already DELIVERED means cash may have changed hands.
    const delivered = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "DELIVERED",
    });
    expect(await payCodWithWallet(delivered.orderId)).toEqual({
      error: "badState",
    });

    // Someone else's order is invisible.
    const stranger = await makeCourier("nosy");
    as(stranger);
    expect(await payCodWithWallet(orderId)).toEqual({ error: "notFound" });
  });
});
