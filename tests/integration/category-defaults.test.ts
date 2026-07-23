// setCategoryShippingDefaults: delivery managers (not just admins) can set a
// category's delivery defaults — and ONLY those two fields — validated,
// audited, and clearable. Local Postgres.
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

import { setCategoryShippingDefaults } from "@/lib/actions/category";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let managerId: string;
let buyerId: string;
let categoryId: string;
const userIds: string[] = [];

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const manager = await prisma.user.create({
    data: {
      email: `cd-dm-${uniq}@t.local`,
      roles: ["DELIVERY_MANAGER"],
      locale: "en",
    },
  });
  const buyer = await prisma.user.create({
    data: { email: `cd-b-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  const category = await prisma.category.create({
    data: { name: { en: "Fridges", ar: "ثلاجات" }, slug: `cd-cat-${uniq}` },
  });
  managerId = manager.id;
  buyerId = buyer.id;
  categoryId = category.id;
  userIds.push(manager.id, buyer.id);
});

afterAll(async () => {
  await prisma.auditLog
    .deleteMany({ where: { entity: "Category", entityId: categoryId } })
    .catch(() => {});
  await prisma.category.delete({ where: { id: categoryId } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
});

async function defaultsOf() {
  return prisma.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { defaultWeightGrams: true, defaultDimensions: true },
  });
}

describe("setCategoryShippingDefaults", () => {
  it("is forbidden for non-delivery-staff", async () => {
    as(buyerId);
    const res = await setCategoryShippingDefaults(categoryId, 40_000, null);
    expect(res.error).toBe("forbidden");
    expect((await defaultsOf()).defaultWeightGrams).toBeNull();
  });

  it("lets a DELIVERY_MANAGER set weight and size, audited", async () => {
    as(managerId);
    const res = await setCategoryShippingDefaults(categoryId, 60_000, {
      l: 70,
      w: 70,
      h: 170,
    });
    expect(res.ok).toBe(true);

    const after = await defaultsOf();
    expect(after.defaultWeightGrams).toBe(60_000);
    expect(after.defaultDimensions).toEqual({ l: 70, w: 70, h: 170 });

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "category.shippingDefaults",
        entity: "Category",
        entityId: categoryId,
        actorId: managerId,
      },
    });
    expect(audit).toBeTruthy();
  });

  it("rejects out-of-range values", async () => {
    as(managerId);
    expect(
      (await setCategoryShippingDefaults(categoryId, -5, null)).error,
    ).toBe("weightInvalid");
    expect(
      (
        await setCategoryShippingDefaults(categoryId, 1_000, {
          l: 0,
          w: 10,
          h: 10,
        })
      ).error,
    ).toBe("dimensionsInvalid");
    // Unchanged by the failed attempts.
    expect((await defaultsOf()).defaultWeightGrams).toBe(60_000);
  });

  it("rejects an unknown category", async () => {
    as(managerId);
    const res = await setCategoryShippingDefaults("nope", 1_000, null);
    expect(res.error).toBe("notFound");
  });

  it("clears both fields with nulls", async () => {
    as(managerId);
    const res = await setCategoryShippingDefaults(categoryId, null, null);
    expect(res.ok).toBe(true);
    const after = await defaultsOf();
    expect(after.defaultWeightGrams).toBeNull();
    expect(after.defaultDimensions).toBeNull();
  });
});
