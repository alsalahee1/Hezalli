// Multi-location (docs §42j): an owner runs several branches, switches which
// one the app operates via the point_branch cookie, and an admin can add
// branches to an existing owner. Runs against local Postgres.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock, cookieStore } = vi.hoisted(() => ({
  authMock: vi.fn(),
  cookieStore: new Map<string, string>(),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => {
      const v = cookieStore.get(k);
      return v ? { value: v } : undefined;
    },
    set: (k: string, v: string) => {
      cookieStore.set(k, v);
    },
  }),
}));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<typeof import("next-intl/server")>()),
  getLocale: vi.fn().mockResolvedValue("en"),
}));

import { setActiveBranch } from "@/lib/actions/point";
import { adminAddPointBranch } from "@/lib/actions/point-application";
import { requireDeliveryPoint } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

const uniq = Date.now().toString(36);
let ownerId: string;
let adminId: string;
let branchA: string;
let branchB: string;
let outsiderPointId: string;
let userIds: string[];

beforeAll(async () => {
  const owner = await prisma.user.create({
    data: {
      email: `ml-own-${uniq}@t.local`,
      phone: `7811${uniq}`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  // Two branches, A created before B → A is the default (orderBy createdAt).
  const a = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Branch A ${uniq}`,
      phone: "770000021",
      governorate: `MLHub-${uniq}`,
      city: "Aden",
      addressLine: "A st",
    },
  });
  const b = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Branch B ${uniq}`,
      phone: "770000022",
      governorate: `MLHub-${uniq}`,
      city: "Aden",
      addressLine: "B st",
    },
  });
  const otherOwner = await prisma.user.create({
    data: {
      email: `ml-own2-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const outside = await prisma.deliveryPoint.create({
    data: {
      ownerId: otherOwner.id,
      name: `Outsider ${uniq}`,
      phone: "770000023",
      governorate: `MLHub2-${uniq}`,
      city: "Aden",
      addressLine: "O st",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `ml-adm-${uniq}@t.local`,
      roles: ["DELIVERY_MANAGER"],
      locale: "en",
    },
  });
  ownerId = owner.id;
  adminId = admin.id;
  branchA = a.id;
  branchB = b.id;
  outsiderPointId = outside.id;
  userIds = [owner.id, otherOwner.id, admin.id];
});

afterAll(async () => {
  await prisma.auditLog
    .deleteMany({ where: { actorId: { in: userIds } } })
    .catch(() => {});
  await prisma.deliveryPoint
    .deleteMany({ where: { ownerId: { in: userIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
});

describe("point multi-location", () => {
  it("defaults to the first branch, switches on request, and refuses others", async () => {
    cookieStore.clear();
    as(ownerId);

    // No cookie → the earliest-created active branch (A).
    expect(await requireDeliveryPoint()).toMatchObject({
      pointId: branchA,
      access: "OWNER",
    });

    // Switch to B → the cookie now steers the resolution.
    expect(await setActiveBranch(branchB)).toEqual({ ok: true });
    expect(await requireDeliveryPoint()).toMatchObject({ pointId: branchB });

    // A branch the owner doesn't own can't be selected, and the current
    // branch is unchanged.
    expect(await setActiveBranch(outsiderPointId)).toEqual({
      error: "forbidden",
    });
    expect(await requireDeliveryPoint()).toMatchObject({ pointId: branchB });
  });

  it("lets an admin add a branch to an existing owner", async () => {
    const before = await prisma.deliveryPoint.count({
      where: { ownerId },
    });

    const fd = new FormData();
    fd.set("owner", `ml-own-${uniq}@t.local`);
    fd.set("name", `Branch C ${uniq}`);
    fd.set("phone", "770000024");
    fd.set("governorate", `MLHub-${uniq}`);
    fd.set("city", "Aden");
    fd.set("addressLine", "C st");

    // Non-ops refused.
    as(ownerId);
    expect(await adminAddPointBranch(fd)).toEqual({ error: "forbidden" });

    as(adminId);
    expect(await adminAddPointBranch(fd)).toEqual({ ok: true });
    expect(await prisma.deliveryPoint.count({ where: { ownerId } })).toBe(
      before + 1,
    );

    // Unknown owner is rejected.
    const bad = new FormData();
    bad.set("owner", "000000000");
    bad.set("name", "X");
    bad.set("phone", "1");
    bad.set("governorate", "G");
    bad.set("city", "C");
    bad.set("addressLine", "A");
    expect(await adminAddPointBranch(bad)).toEqual({ error: "ownerNotFound" });
  });
});
