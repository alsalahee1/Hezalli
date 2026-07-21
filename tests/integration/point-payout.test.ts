// Point payout requests (docs/DELIVERY-POINTS.md §22): guarded request,
// race-safe pay (exactly one PAYOUT ledger row), reject with no ledger effect.
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
  markPointPayoutPaid,
  rejectPointPayout,
  requestPointPayout,
} from "@/lib/actions/point-payout";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let ownerId: string;
let pointId: string;
let adminId: string;

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: {
      email: `pp-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const admin = await prisma.user.create({
    data: { email: `pp-adm-${uniq}@t.local`, roles: ["ADMIN"], locale: "en" },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Payout Point ${uniq}`,
      phone: "770000014",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Payout st",
    },
  });
  // Earnings to draw on: 20.00 in handling fees.
  await prisma.deliveryPointLedgerEntry.createMany({
    data: [
      { pointId: point.id, type: "HANDLING_FEE", amountUsd: 12 },
      { pointId: point.id, type: "HANDLING_FEE", amountUsd: 8 },
    ],
  });
  ownerId = owner.id;
  pointId = point.id;
  adminId = admin.id;
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: ownerId } })
    .catch(() => {});
  await prisma.auditLog
    .deleteMany({ where: { actorId: adminId } })
    .catch(() => {});
  await prisma.deliveryPoint.delete({ where: { id: pointId } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: [ownerId, adminId] } } })
    .catch(() => {});
});

describe("requestPointPayout", () => {
  it("rejects below-min, over-balance, and double requests; accepts a valid one", async () => {
    as(ownerId);
    expect(await requestPointPayout(5)).toEqual({ error: "belowMin" });
    expect(await requestPointPayout(50)).toEqual({ error: "insufficient" });
    expect(await requestPointPayout(15)).toEqual({ ok: true });
    expect(await requestPointPayout(15)).toEqual({ error: "alreadyOpen" });
    const open = await prisma.pointPayoutRequest.findMany({
      where: { pointId, status: "REQUESTED" },
    });
    expect(open).toHaveLength(1);
    expect(Number(open[0].amountUsd)).toBe(15);
  });

  it("non-operators are refused", async () => {
    as(adminId);
    expect(await requestPointPayout(15)).toEqual({ error: "forbidden" });
  });
});

describe("markPointPayoutPaid / rejectPointPayout", () => {
  it("paying writes exactly one PAYOUT ledger row and can't double-pay", async () => {
    const req = await prisma.pointPayoutRequest.findFirstOrThrow({
      where: { pointId, status: "REQUESTED" },
    });
    as(ownerId); // operator can't resolve
    expect(await markPointPayoutPaid(req.id, "x")).toEqual({
      error: "forbidden",
    });

    as(adminId);
    const [a, b] = await Promise.all([
      markPointPayoutPaid(req.id, "bank ref 1"),
      markPointPayoutPaid(req.id, "bank ref 2"),
    ]);
    // Exactly one wins the conditional flip.
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);

    const rows = await prisma.deliveryPointLedgerEntry.findMany({
      where: { pointId, type: "PAYOUT" },
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amountUsd)).toBe(-15);
    const summary = await pointLedgerSummary(pointId);
    expect(summary.balance).toBe(5); // 20 earned − 15 paid
    // Re-pay after settled state also refuses.
    expect(await markPointPayoutPaid(req.id, "again")).toEqual({
      error: "badState",
    });
    // The operator was told.
    expect(
      await prisma.notification.count({
        where: { userId: ownerId, title: "Payout paid" },
      }),
    ).toBe(1);
  });

  it("rejecting records the reason and leaves the ledger alone", async () => {
    // Top the balance back up (5 free after the payout) so a request clears min.
    await prisma.deliveryPointLedgerEntry.create({
      data: { pointId, type: "ADJUSTMENT", amountUsd: 10 },
    });
    as(ownerId);
    expect(await requestPointPayout()).toEqual({ ok: true }); // full free = 15
    const req = await prisma.pointPayoutRequest.findFirstOrThrow({
      where: { pointId, status: "REQUESTED" },
    });
    expect(Number(req.amountUsd)).toBe(15);

    as(adminId);
    expect(await rejectPointPayout(req.id, "wrong bank details")).toEqual({
      ok: true,
    });
    const after = await prisma.pointPayoutRequest.findUniqueOrThrow({
      where: { id: req.id },
    });
    expect(after.status).toBe("REJECTED");
    expect(after.note).toBe("wrong bank details");
    // No ledger effect: still exactly one PAYOUT row from the earlier test.
    expect(
      await prisma.deliveryPointLedgerEntry.count({
        where: { pointId, type: "PAYOUT" },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: ownerId, title: "Payout request rejected" },
      }),
    ).toBe(1);
    // A rejected request no longer blocks a new one.
    as(ownerId);
    expect(await requestPointPayout(10)).toEqual({ ok: true });
  });
});
