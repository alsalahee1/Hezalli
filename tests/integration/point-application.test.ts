// Exercises the "become a delivery point" application flow against local
// Postgres. Boundaries mocked: auth() (impersonation), revalidatePath,
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
  applyAsDeliveryPoint,
  reviewPointApplication,
  setPointStatus,
} from "@/lib/actions/point-application";
import { pointReceiveParcel } from "@/lib/actions/point";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

const applyForm = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("pointName", "Corner Store");
  fd.set("fullName", "Point Operator");
  fd.set("phone", "+967 770 000 001");
  fd.set("governorate", "Aden");
  fd.set("city", "Aden");
  fd.set("addressLine", "Main street, next to the mosque");
  fd.set("acceptTerms", "on");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};

let applicantId: string;
let adminId: string;
const extraUserIds: string[] = [];

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const applicant = await prisma.user.create({
    data: { email: `pt-app-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  const admin = await prisma.user.create({
    data: { email: `pt-adm-${uniq}@t.local`, roles: ["ADMIN"], locale: "en" },
  });
  applicantId = applicant.id;
  adminId = admin.id;
  extraUserIds.push(applicant.id, admin.id);
});

afterAll(async () => {
  await prisma.auditLog
    .deleteMany({ where: { actorId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
});

describe("delivery point application", () => {
  it("rejects an unauthenticated or invalid application", async () => {
    as(null);
    expect(await applyAsDeliveryPoint(undefined, applyForm())).toMatchObject({
      formError: "notSignedIn",
    });

    as(applicantId);
    const bad = await applyAsDeliveryPoint(
      undefined,
      applyForm({ addressLine: "x" }),
    );
    expect(bad.errors?.addressLine).toBe("addressShort");
  });

  it("files a PENDING application without granting anything", async () => {
    as(applicantId);
    expect(await applyAsDeliveryPoint(undefined, applyForm())).toEqual({
      ok: true,
    });

    const app = await prisma.deliveryPointApplication.findUnique({
      where: { userId: applicantId },
    });
    expect(app?.status).toBe("PENDING");

    const user = await prisma.user.findUnique({
      where: { id: applicantId },
      select: { roles: true, deliveryPoint: true },
    });
    expect(user?.roles).not.toContain("DELIVERY_POINT");
    expect(user?.deliveryPoint).toBeNull();

    // A second application while one is pending is refused.
    expect(await applyAsDeliveryPoint(undefined, applyForm())).toMatchObject({
      formError: "alreadyPending",
    });
  });

  it("approval grants the role and creates the point (admin only)", async () => {
    const app = await prisma.deliveryPointApplication.findUnique({
      where: { userId: applicantId },
      select: { id: true },
    });
    const fd = new FormData();
    fd.set("applicationId", app!.id);
    fd.set("decision", "approve");

    // Not an admin → no-op.
    as(applicantId);
    await reviewPointApplication(fd);
    expect(
      (
        await prisma.deliveryPointApplication.findUnique({
          where: { userId: applicantId },
        })
      )?.status,
    ).toBe("PENDING");

    as(adminId);
    await reviewPointApplication(fd);

    const user = await prisma.user.findUnique({
      where: { id: applicantId },
      select: { roles: true, deliveryPoint: true },
    });
    expect(user?.roles).toContain("DELIVERY_POINT");
    expect(user?.deliveryPoint).toMatchObject({
      name: "Corner Store",
      governorate: "Aden",
      status: "ACTIVE",
    });
  });

  it("a suspended point locks the operator out of scan actions", async () => {
    const point = await prisma.deliveryPoint.findUnique({
      where: { ownerId: applicantId },
      select: { id: true },
    });
    const fd = new FormData();
    fd.set("pointId", point!.id);
    fd.set("status", "SUSPENDED");
    as(adminId);
    await setPointStatus(fd);

    as(applicantId);
    expect(await pointReceiveParcel("WHATEVER")).toEqual({
      error: "forbidden",
    });
  });
});
