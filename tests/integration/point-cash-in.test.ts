// Driver COD remittance via points (docs/DELIVERY-POINTS.md §12): one atomic
// double entry moves cash from the courier's ledger to the point's cash side.
// Boundaries mocked: auth() (impersonation), revalidatePath, getLocale.
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

import { pointDriverCashIn } from "@/lib/actions/point";
import { courierCashSummary } from "@/lib/courier-ledger";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let ownerId: string;
let pointId: string;
let courierId: string;

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: {
      email: `ci-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: "CashIn Point",
      phone: "770000007",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Street 4",
    },
  });
  const courier = await prisma.user.create({
    data: { email: `ci-crr-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  // The driver is holding $80 of COD cash.
  await prisma.courierLedgerEntry.create({
    data: { courierId: courier.id, type: "COD_COLLECTED", amountUsd: 80 },
  });
  ownerId = owner.id;
  pointId = point.id;
  courierId = courier.id;
});

afterAll(async () => {
  await prisma.courierLedgerEntry
    .deleteMany({ where: { courierId } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: [ownerId, courierId] } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: [ownerId, courierId] } } })
    .catch(() => {});
});

describe("pointDriverCashIn", () => {
  it("guards amount, role, and over-remit", async () => {
    as(courierId); // not a point operator
    expect(await pointDriverCashIn(courierId, 10)).toEqual({
      error: "forbidden",
    });

    as(ownerId);
    expect(await pointDriverCashIn(courierId, 0)).toEqual({
      error: "badAmount",
    });
    expect(await pointDriverCashIn(ownerId, 10)).toEqual({
      error: "invalidDriver",
    });
    expect(await pointDriverCashIn(courierId, 80.01)).toEqual({
      error: "overRemit",
    });
  });

  it("moves cash from the driver's ledger to the point's cash side", async () => {
    as(ownerId);
    expect(await pointDriverCashIn(courierId, 50)).toEqual({ ok: true });

    const driverCash = await courierCashSummary(courierId);
    expect(driverCash.cashOnHand).toBeCloseTo(30); // 80 − 50
    expect(driverCash.totalRemitted).toBeCloseTo(50);

    const pointCash = await pointLedgerSummary(pointId);
    expect(pointCash.cashOnHand).toBeCloseTo(50);
    // Earnings side untouched — cash-in is not point income.
    expect(pointCash.balance).toBeCloseTo(0);

    // Driver notified; remittance attributed to the operator.
    expect(
      await prisma.notification.findFirst({
        where: { userId: courierId, title: { contains: "Cash hand-in" } },
      }),
    ).toBeTruthy();
    expect(
      await prisma.courierLedgerEntry.findFirst({
        where: { courierId, type: "REMITTANCE", createdById: ownerId },
      }),
    ).toBeTruthy();

    // Can't hand in more than what remains.
    expect(await pointDriverCashIn(courierId, 31)).toEqual({
      error: "overRemit",
    });
  });
});
