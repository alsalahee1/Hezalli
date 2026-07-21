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
} from "@/lib/actions/courier-ledger";
import { setCourierDeposit, setPointDeposit } from "@/lib/actions/deposit";
import { pointDriverCashIn } from "@/lib/actions/point";
import { requestPointPayout } from "@/lib/actions/point-payout";
import { courierCashSummary } from "@/lib/courier-ledger";
import { checkPointRoutable } from "@/lib/point-select";
import { prisma } from "@/lib/prisma";
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
