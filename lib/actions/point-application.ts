"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireDeliveryScope } from "@/lib/authz";
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
  const adminId = await requireDeliveryScope("POINTS");
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

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: application.userId },
        data: { roles: { set: roles } },
      });
      // The self-service application creates the applicant's FIRST point (and,
      // on a re-approval, reactivates/updates that same one rather than
      // duplicating). Additional branches for an owner who already has one are
      // admin-created (adminAddPointBranch), not made here — so this touches
      // at most the applicant's existing single point. ownerId is no longer
      // unique (docs §42j), so resolve it explicitly instead of upsert-by-owner.
      const existing = await tx.deliveryPoint.findFirst({
        where: { ownerId: application.userId },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      const fields = {
        name: application.pointName,
        phone: application.phone,
        governorate: application.governorate,
        city: application.city,
        addressLine: application.addressLine,
        lat: application.lat,
        lng: application.lng,
      };
      if (existing) {
        await tx.deliveryPoint.update({
          where: { id: existing.id },
          data: { ...fields, status: "ACTIVE" },
        });
      } else {
        await tx.deliveryPoint.create({
          data: { ownerId: application.userId, ...fields },
        });
      }
      await tx.deliveryPointApplication.update({
        where: { id: applicationId },
        data: {
          status: "APPROVED",
          reviewedById: adminId,
          reviewedAt: new Date(),
          reviewNote: reviewNote || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: "point.approve",
          entity: "DeliveryPointApplication",
          entityId: applicationId,
          meta: reviewNote ? { reviewNote } : undefined,
        },
      });
    });
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

// Multi-location (docs §42j): an admin creates an ADDITIONAL branch for an
// existing owner (found by email or phone), or onboards a new operator
// directly. The self-service application still makes only the first point;
// branches 2..N come through here. Grants the DELIVERY_POINT role if missing.
export async function adminAddPointBranch(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const adminId = await requireDeliveryScope("POINTS");
  if (!adminId) return { error: "forbidden" };

  const identifier = String(formData.get("owner") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const governorate = String(formData.get("governorate") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const addressLine = String(formData.get("addressLine") ?? "").trim();
  if (!identifier || !name || !phone || !governorate || !city || !addressLine) {
    return { error: "badInput" };
  }

  const owner = await prisma.user.findUnique({
    where: identifier.includes("@")
      ? { email: identifier.toLowerCase() }
      : { phone: identifier },
    select: { id: true, roles: true, isSuspended: true, deletedAt: true },
  });
  if (!owner || owner.isSuspended || owner.deletedAt) {
    return { error: "ownerNotFound" };
  }
  // Someone working at a hub as staff can't also own branches.
  const staff = await prisma.pointStaff.findUnique({
    where: { userId: owner.id },
    select: { id: true },
  });
  if (staff) return { error: "isStaff" };

  const roles: Role[] = owner.roles.includes("DELIVERY_POINT")
    ? owner.roles
    : [...owner.roles, "DELIVERY_POINT"];

  await prisma.$transaction(async (tx) => {
    if (!owner.roles.includes("DELIVERY_POINT")) {
      await tx.user.update({
        where: { id: owner.id },
        data: { roles: { set: roles } },
      });
    }
    const created = await tx.deliveryPoint.create({
      data: { ownerId: owner.id, name, phone, governorate, city, addressLine },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: "point.addBranch",
        entity: "DeliveryPoint",
        entityId: created.id,
        meta: { ownerId: owner.id },
      },
    });
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/points`);
  revalidatePath(`/${locale}/delivery-manager/points`);
  return { ok: true };
}

// Admin sets a point's parcel capacity (max held/inbound at once). Empty or
// zero clears it back to unlimited. Gates NEW routing only — see the docs §8.
export async function setPointCapacity(formData: FormData): Promise<void> {
  const adminId = await requireDeliveryScope("POINTS");
  if (!adminId) return;

  const pointId = String(formData.get("pointId") ?? "");
  if (!pointId) return;
  const raw = String(formData.get("capacity") ?? "").trim();
  const n = Math.trunc(Number(raw));
  const capacity = raw !== "" && Number.isFinite(n) && n > 0 ? n : null;

  const point = await prisma.deliveryPoint.findUnique({
    where: { id: pointId },
    select: { id: true },
  });
  if (!point) return;

  await prisma.$transaction([
    prisma.deliveryPoint.update({
      where: { id: pointId },
      data: { capacity },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "point.capacity",
        entity: "DeliveryPoint",
        entityId: pointId,
        meta: { capacity },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/points/${pointId}`);
  revalidatePath(`/${locale}/admin/points`);
}

// Admin toggles a point's status. Suspending stops new routing (the seller
// picker only lists ACTIVE points) and locks the operator out of /point.
export async function setPointStatus(formData: FormData): Promise<void> {
  const adminId = await requireDeliveryScope("POINTS");
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
