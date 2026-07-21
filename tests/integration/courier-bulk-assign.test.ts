// Batch assignment: assign many unassigned parcels to one courier at once.
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

import { assignManyCouriers } from "@/lib/actions/courier";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let adminId: string;
let courierId: string;
let otherCourierId: string;
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  const admin = await prisma.user.create({
    data: { email: `adm-${uniq}@t.local`, roles: ["ADMIN"], locale: "en" },
  });
  const courier = await prisma.user.create({
    data: { email: `c1-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const other = await prisma.user.create({
    data: { email: `c2-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  adminId = admin.id;
  courierId = courier.id;
  otherCourierId = other.id;
  extraUserIds.push(admin.id, courier.id, other.id);
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

async function shippedParcel(driverId: string | null = null) {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "SHIPPED",
  });
  const shipment = await prisma.shipment.create({
    data: {
      subOrderId,
      status: "IN_TRANSIT",
      platformManaged: true,
      driverId,
      shippedAt: new Date(),
    },
    select: { id: true },
  });
  return shipment.id;
}

describe("assignManyCouriers", () => {
  it("claims only the still-unassigned parcels and skips the rest", async () => {
    const a = await shippedParcel(); // unassigned
    const b = await shippedParcel(); // unassigned
    const c = await shippedParcel(otherCourierId); // already assigned

    as(adminId);
    const res = await assignManyCouriers([a, b, c], courierId);
    expect(res).toEqual({ ok: true, count: 2 });

    const rows = await prisma.shipment.findMany({
      where: { id: { in: [a, b, c] } },
      select: { id: true, driverId: true },
    });
    const by = new Map(rows.map((r) => [r.id, r.driverId]));
    expect(by.get(a)).toBe(courierId);
    expect(by.get(b)).toBe(courierId);
    expect(by.get(c)).toBe(otherCourierId); // untouched

    // The driver got exactly one "N deliveries assigned" notification.
    const notes = await prisma.notification.findMany({
      where: { userId: courierId, type: "SHIPMENT" },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("2");
  });

  it("rejects a non-admin, a bad driver, and empty input", async () => {
    const a = await shippedParcel();

    as(courierId); // not an admin
    expect(await assignManyCouriers([a], courierId)).toEqual({
      error: "forbidden",
    });

    as(adminId);
    expect(await assignManyCouriers([a], adminId)).toEqual({
      error: "invalidDriver", // admin isn't a courier
    });
    expect(await assignManyCouriers([], courierId)).toEqual({
      error: "noParcels",
    });
  });
});
