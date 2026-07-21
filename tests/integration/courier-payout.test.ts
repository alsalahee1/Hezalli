// Driver earnings payout: an admin settles fees owed via a PAYOUT ledger row.
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

import { recordEarningsPayout } from "@/lib/actions/courier-ledger";
import { courierCashSummary } from "@/lib/courier-ledger";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);
const form = (data: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
};

let adminId: string;
const userIds: string[] = [];

beforeAll(async () => {
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
  await prisma.courierLedgerEntry
    .deleteMany({ where: { courierId: { in: userIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
});

async function courierWithEarnings(amount: number) {
  const c = await prisma.user.create({
    data: {
      email: `crr-${Math.random().toString(36).slice(2)}@t.local`,
      roles: ["COURIER"],
      locale: "en",
    },
  });
  userIds.push(c.id);
  await prisma.courierLedgerEntry.create({
    data: { courierId: c.id, type: "EARNING", amountUsd: amount },
  });
  return c.id;
}

describe("recordEarningsPayout", () => {
  it("reduces earnings owed and tracks paid; admin-only", async () => {
    const courierId = await courierWithEarnings(10);

    // A courier can't pay themselves.
    as(courierId);
    expect(
      await recordEarningsPayout(form({ courierId, amount: "4" })),
    ).toEqual({ error: "forbidden" });

    as(adminId);
    expect(
      await recordEarningsPayout(
        form({ courierId, amount: "4", note: "cash" }),
      ),
    ).toEqual({ ok: true });

    const s = await courierCashSummary(courierId);
    expect(s.earnings).toBe(6); // 10 owed − 4 paid
    expect(s.earningsPaid).toBe(4);
  });

  it("rejects a non-positive payout and a non-courier target", async () => {
    const courierId = await courierWithEarnings(5);
    as(adminId);
    expect(
      await recordEarningsPayout(form({ courierId, amount: "0" })),
    ).toEqual({ error: "badInput" });
    expect(
      await recordEarningsPayout(form({ courierId: adminId, amount: "5" })),
    ).toEqual({ error: "notCourier" });
  });
});
