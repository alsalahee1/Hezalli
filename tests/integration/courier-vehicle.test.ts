// Ops changing a courier's vehicle (setCourierVehicle): admin-gated, validated
// against the application vehicle list, audited, and clearable.
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

import { setCourierVehicle } from "@/lib/actions/courier";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let adminId: string;
let courierId: string;
let buyerId: string;
const userIds: string[] = [];

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const admin = await prisma.user.create({
    data: { email: `veh-adm-${uniq}@t.local`, roles: ["ADMIN"], locale: "en" },
  });
  const courier = await prisma.user.create({
    data: {
      email: `veh-c-${uniq}@t.local`,
      roles: ["COURIER"],
      locale: "en",
      courierVehicleType: "motorbike",
    },
  });
  const buyer = await prisma.user.create({
    data: { email: `veh-b-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  adminId = admin.id;
  courierId = courier.id;
  buyerId = buyer.id;
  userIds.push(admin.id, courier.id, buyer.id);
});

afterAll(async () => {
  await prisma.auditLog
    .deleteMany({ where: { entityId: { in: userIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
});

async function vehicleOf(id: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: { courierVehicleType: true },
  });
  return u.courierVehicleType;
}

describe("setCourierVehicle", () => {
  it("is forbidden for non-delivery-staff", async () => {
    as(buyerId);
    const res = await setCourierVehicle(courierId, "van");
    expect(res.error).toBe("forbidden");
    expect(await vehicleOf(courierId)).toBe("motorbike"); // unchanged
  });

  it("rejects a vehicle not on the application list", async () => {
    as(adminId);
    const res = await setCourierVehicle(courierId, "rocket");
    expect(res.error).toBe("badVehicle");
    expect(await vehicleOf(courierId)).toBe("motorbike");
  });

  it("only targets couriers", async () => {
    as(adminId);
    const res = await setCourierVehicle(buyerId, "van");
    expect(res.error).toBe("notFound");
  });

  it("updates the vehicle and writes an audit row", async () => {
    as(adminId);
    const res = await setCourierVehicle(courierId, "van");
    expect(res.ok).toBe(true);
    expect(await vehicleOf(courierId)).toBe("van");

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "courier.vehicle",
        entity: "User",
        entityId: courierId,
        actorId: adminId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
    expect(audit?.meta).toMatchObject({ from: "motorbike", to: "van" });
  });

  it("clears the vehicle (back to unconstrained) with an empty value", async () => {
    as(adminId);
    const res = await setCourierVehicle(courierId, "");
    expect(res.ok).toBe(true);
    expect(await vehicleOf(courierId)).toBeNull();
  });
});
