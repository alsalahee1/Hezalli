"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import type { Role } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { fieldErrors } from "@/lib/validations/auth";
import { applyCourierSchema } from "@/lib/validations/courier";

// Message values are i18n KEYS — the `Drive` namespace for the applicant form,
// translated client-side (same pattern as lib/actions/seller.ts).
export type CourierFormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

// "Become a driver" — a REQUEST only. This never grants access: it creates (or
// re-opens) a PENDING CourierApplication for the signed-in user. A rejected
// applicant may resubmit — the single per-user row is reused and flipped back
// to PENDING. The COURIER role is granted later, admin-gated, in
// reviewCourierApplication — never here.
export async function applyAsCourier(
  _prev: CourierFormState | undefined,
  formData: FormData,
): Promise<CourierFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { formError: "notSignedIn" };

  const parsed = applyCourierSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    governorate: formData.get("governorate"),
    city: formData.get("city"),
    vehicleType: formData.get("vehicleType"),
    notes: formData.get("notes") || undefined,
    acceptTerms: formData.get("acceptTerms") === "on",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      roles: true,
      isSuspended: true,
      deletedAt: true,
      courierApplication: { select: { status: true } },
    },
  });
  if (!user || user.isSuspended || user.deletedAt)
    return { formError: "notSignedIn" };

  // Already a driver, or an application is still under review → nothing to do.
  if (user.roles.includes("COURIER")) return { formError: "alreadyCourier" };
  if (user.courierApplication?.status === "PENDING")
    return { formError: "alreadyPending" };

  const { fullName, phone, governorate, city, vehicleType, notes } =
    parsed.data;

  // Upsert: first-time applicants create a row; previously-rejected ones reuse
  // it and reset the review fields so the queue shows a fresh PENDING request.
  await prisma.courierApplication.upsert({
    where: { userId },
    create: {
      userId,
      fullName,
      phone,
      governorate,
      city,
      vehicleType,
      notes: notes || null,
    },
    update: {
      fullName,
      phone,
      governorate,
      city,
      vehicleType,
      notes: notes || null,
      status: "PENDING",
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/couriers`);
  return { ok: true };
}

// Admin review of a courier application. Approve = grant the COURIER role (so
// the applicant can sign into the driver app) + mark APPROVED; reject = mark
// REJECTED with an optional note (the applicant may resubmit). Both are
// audited. Role-granting lives ONLY here, behind the admin gate.
export async function reviewCourierApplication(
  formData: FormData,
): Promise<void> {
  const adminId = await requireAdminId();
  if (!adminId) return;

  const applicationId = String(formData.get("applicationId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();
  if (!applicationId || (decision !== "approve" && decision !== "reject"))
    return;

  const application = await prisma.courierApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, userId: true },
  });
  // Only act on requests still awaiting a decision (idempotent against double
  // clicks / stale forms).
  if (!application || application.status !== "PENDING") return;

  if (decision === "approve") {
    const applicant = await prisma.user.findUnique({
      where: { id: application.userId },
      select: { roles: true },
    });
    if (!applicant) return;
    const roles: Role[] = applicant.roles.includes("COURIER")
      ? applicant.roles
      : [...applicant.roles, "COURIER"];

    await prisma.$transaction([
      prisma.user.update({
        where: { id: application.userId },
        data: { roles: { set: roles } },
      }),
      prisma.courierApplication.update({
        where: { id: applicationId },
        data: {
          status: "APPROVED",
          reviewedById: adminId,
          reviewedAt: new Date(),
          reviewNote: reviewNote || null,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: "courier.approve",
          entity: "CourierApplication",
          entityId: applicationId,
          meta: reviewNote ? { reviewNote } : undefined,
        },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.courierApplication.update({
        where: { id: applicationId },
        data: {
          status: "REJECTED",
          reviewedById: adminId,
          reviewedAt: new Date(),
          reviewNote: reviewNote || null,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: "courier.reject",
          entity: "CourierApplication",
          entityId: applicationId,
          meta: reviewNote ? { reviewNote } : undefined,
        },
      }),
    ]);
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/couriers`);
}
