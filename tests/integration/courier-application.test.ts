// Exercises the "become a driver" application + admin review flow against
// local Postgres. Only request-context boundaries are mocked: auth() (to
// impersonate applicant/admin), revalidatePath, and getLocale.
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
  applyAsCourier,
  reviewCourierApplication,
} from "@/lib/actions/courier-application";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

function form(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

const validApplication = {
  fullName: "Ahmed Ali",
  phone: "+967 771 234 567",
  governorate: "Sana'a",
  city: "Old City",
  vehicleType: "motorbike",
  notes: "Available evenings",
  acceptTerms: "on",
};

let applicantId: string;
let adminId: string;
const userIds: string[] = [];

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const applicant = await prisma.user.create({
    data: { email: `apply-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  const admin = await prisma.user.create({
    data: { email: `admin-${uniq}@t.local`, roles: ["ADMIN"], locale: "en" },
  });
  applicantId = applicant.id;
  adminId = admin.id;
  userIds.push(applicant.id, admin.id);
});

afterAll(async () => {
  await prisma.auditLog
    .deleteMany({ where: { actorId: { in: userIds } } })
    .catch(() => {});
  await prisma.courierApplication
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
});

describe("applyAsCourier", () => {
  it("rejects a signed-out visitor", async () => {
    as(null);
    const res = await applyAsCourier(undefined, form(validApplication));
    expect(res.formError).toBe("notSignedIn");
  });

  it("validates required fields", async () => {
    as(applicantId);
    const res = await applyAsCourier(
      undefined,
      form({ ...validApplication, fullName: "", vehicleType: "" }),
    );
    expect(res.errors?.fullName).toBeTruthy();
    expect(res.errors?.vehicleType).toBeTruthy();
  });

  it("creates a PENDING application", async () => {
    as(applicantId);
    const res = await applyAsCourier(undefined, form(validApplication));
    expect(res.ok).toBe(true);
    const app = await prisma.courierApplication.findUnique({
      where: { userId: applicantId },
    });
    expect(app?.status).toBe("PENDING");
    expect(app?.vehicleType).toBe("motorbike");
  });

  it("blocks a second application while one is under review", async () => {
    as(applicantId);
    const res = await applyAsCourier(undefined, form(validApplication));
    expect(res.formError).toBe("alreadyPending");
  });
});

describe("reviewCourierApplication", () => {
  it("ignores a non-admin actor", async () => {
    as(applicantId); // an applicant, not an admin
    const app = await prisma.courierApplication.findUniqueOrThrow({
      where: { userId: applicantId },
    });
    await reviewCourierApplication(
      form({ applicationId: app.id, decision: "approve" }),
    );
    const after = await prisma.courierApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(after.status).toBe("PENDING"); // unchanged
  });

  it("rejects with a note and lets the applicant resubmit", async () => {
    const app = await prisma.courierApplication.findUniqueOrThrow({
      where: { userId: applicantId },
    });
    as(adminId);
    await reviewCourierApplication(
      form({
        applicationId: app.id,
        decision: "reject",
        reviewNote: "Need ID",
      }),
    );
    let after = await prisma.courierApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(after.status).toBe("REJECTED");
    expect(after.reviewNote).toBe("Need ID");
    // Applicant is still not a courier.
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: applicantId },
    });
    expect(u.roles).not.toContain("COURIER");

    // Resubmit re-opens the same row as PENDING and clears review fields.
    as(applicantId);
    const res = await applyAsCourier(undefined, form(validApplication));
    expect(res.ok).toBe(true);
    after = await prisma.courierApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(after.status).toBe("PENDING");
    expect(after.reviewNote).toBeNull();
  });

  it("approves and grants the COURIER role", async () => {
    const app = await prisma.courierApplication.findUniqueOrThrow({
      where: { userId: applicantId },
    });
    as(adminId);
    await reviewCourierApplication(
      form({ applicationId: app.id, decision: "approve" }),
    );
    const after = await prisma.courierApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(after.status).toBe("APPROVED");
    expect(after.reviewedById).toBe(adminId);

    const u = await prisma.user.findUniqueOrThrow({
      where: { id: applicantId },
    });
    expect(u.roles).toContain("COURIER");

    // Audit trail written.
    const audit = await prisma.auditLog.findFirst({
      where: {
        entity: "CourierApplication",
        entityId: app.id,
        action: "courier.approve",
      },
    });
    expect(audit).toBeTruthy();
  });

  it("is idempotent once decided", async () => {
    const app = await prisma.courierApplication.findUniqueOrThrow({
      where: { userId: applicantId },
    });
    as(adminId);
    await reviewCourierApplication(
      form({ applicationId: app.id, decision: "reject" }),
    );
    const after = await prisma.courierApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(after.status).toBe("APPROVED"); // still approved, reject ignored
  });
});
