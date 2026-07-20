"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import type { Role } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { fieldErrors } from "@/lib/validations/auth";
import { applyPointSchema } from "@/lib/validations/point";

// Message values are i18n KEYS — the `PointApply` namespace for the applicant
// form, translated client-side (same pattern as lib/actions/courier-application.ts).
export type PointFormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

// "Become a delivery point" — a REQUEST only. Creates (or re-opens) a PENDING
// DeliveryPointApplication for the signed-in user. The DELIVERY_POINT role and
// the DeliveryPoint itself are granted later, admin-gated, in
// reviewPointApplication — never here.
export async function applyAsDeliveryPoint(
  _prev: PointFormState | undefined,
  formData: FormData,
): Promise<PointFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { formError: "notSignedIn" };

  const parsed = applyPointSchema.safeParse({
    pointName: formData.get("pointName"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    governorate: formData.get("governorate"),
    city: formData.get("city"),
    addressLine: formData.get("addressLine"),
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
      deliveryPointApplication: { select: { status: true } },
    },
  });
  if (!user || user.isSuspended || user.deletedAt)
    return { formError: "notSignedIn" };

  if (user.roles.includes("DELIVERY_POINT"))
    return { formError: "alreadyPoint" };
  if (user.deliveryPointApplication?.status === "PENDING")
    return { formError: "alreadyPending" };

  const { pointName, fullName, phone, governorate, city, addressLine, notes } =
    parsed.data;

  // Upsert: first-time applicants create a row; previously-rejected ones reuse
  // it and reset the review fields so the queue shows a fresh PENDING request.
  await prisma.deliveryPointApplication.upsert({
    where: { userId },
    create: {
      userId,
      pointName,
      fullName,
      phone,
      governorate,
      city,
      addressLine,
      notes: notes || null,
    },
    update: {
      pointName,
      fullName,
      phone,
      governorate,
      city,
      addressLine,
      notes: notes || null,
      status: "PENDING",
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/points`);
  return { ok: true };
}

// Admin review of a delivery-point application. Approve = grant the
// DELIVERY_POINT role and create (or reactivate) the DeliveryPoint; reject =
// mark REJECTED with an optional note (the applicant may resubmit). Both are
// audited. Role-granting lives ONLY here, behind the admin gate.
export async function reviewPointApplication(
  formData: FormData,
): Promise<void> {
  const adminId = await requireAdminId();
  if (!adminId) return;

  const applicationId = String(formData.get("applicationId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();
  if (!applicationId || (decision !== "approve" && decision !== "reject"))
    return;

  const application = await prisma.deliveryPointApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      userId: true,
      pointName: true,
      phone: true,
      governorate: true,
      city: true,
      addressLine: true,
      lat: true,
      lng: true,
    },
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
    const roles: Role[] = applicant.roles.includes("DELIVERY_POINT")
      ? applicant.roles
      : [...applicant.roles, "DELIVERY_POINT"];

    await prisma.$transaction([
      prisma.user.update({
        where: { id: application.userId },
        data: { roles: { set: roles } },
      }),
      // One point per owner: a re-approved operator gets their point updated
      // and reactivated rather than duplicated.
      prisma.deliveryPoint.upsert({
        where: { ownerId: application.userId },
        create: {
          ownerId: application.userId,
          name: application.pointName,
          phone: application.phone,
          governorate: application.governorate,
          city: application.city,
          addressLine: application.addressLine,
          lat: application.lat,
          lng: application.lng,
        },
        update: {
          name: application.pointName,
          phone: application.phone,
          governorate: application.governorate,
          city: application.city,
          addressLine: application.addressLine,
          lat: application.lat,
          lng: application.lng,
          status: "ACTIVE",
        },
      }),
      prisma.deliveryPointApplication.update({
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
          action: "point.approve",
          entity: "DeliveryPointApplication",
          entityId: applicationId,
          meta: reviewNote ? { reviewNote } : undefined,
        },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.deliveryPointApplication.update({
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
          action: "point.reject",
          entity: "DeliveryPointApplication",
          entityId: applicationId,
          meta: reviewNote ? { reviewNote } : undefined,
        },
      }),
    ]);
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/points`);
}

// Admin toggles a point's status. Suspending stops new routing (the seller
// picker only lists ACTIVE points) and locks the operator out of /point.
export async function setPointStatus(formData: FormData): Promise<void> {
  const adminId = await requireAdminId();
  if (!adminId) return;

  const pointId = String(formData.get("pointId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!pointId || (status !== "ACTIVE" && status !== "SUSPENDED")) return;

  const point = await prisma.deliveryPoint.findUnique({
    where: { id: pointId },
    select: { id: true },
  });
  if (!point) return;

  await prisma.$transaction([
    prisma.deliveryPoint.update({
      where: { id: pointId },
      data: { status },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: status === "ACTIVE" ? "point.activate" : "point.suspend",
        entity: "DeliveryPoint",
        entityId: pointId,
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/points`);
}
