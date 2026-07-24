"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import type { Role } from "@/lib/generated/prisma/client";
import { uniqueMerchantSlug } from "@/lib/merchant";
import { prisma } from "@/lib/prisma";
import { fieldErrors } from "@/lib/validations/auth";
import { applyMerchantSchema } from "@/lib/validations/merchant";

// Message values are i18n KEYS — the `MerchantApply` namespace for the
// applicant form, translated client-side (same pattern as
// lib/actions/point-application.ts).
export type MerchantFormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

// "Become a HezalliPay merchant" — a REQUEST only. Creates (or re-opens) a
// PENDING MerchantApplication for the signed-in user. The MERCHANT role and the
// MerchantProfile are granted later, admin-gated, in reviewMerchantApplication
// — never here.
export async function applyAsMerchant(
  _prev: MerchantFormState | undefined,
  formData: FormData,
): Promise<MerchantFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { formError: "notSignedIn" };

  const parsed = applyMerchantSchema.safeParse({
    businessName: formData.get("businessName"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    category: formData.get("category"),
    governorate: formData.get("governorate"),
    city: formData.get("city"),
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
      merchantApplication: { select: { status: true } },
    },
  });
  if (!user || user.isSuspended || user.deletedAt)
    return { formError: "notSignedIn" };

  if (user.roles.includes("MERCHANT")) return { formError: "alreadyMerchant" };
  if (user.merchantApplication?.status === "PENDING")
    return { formError: "alreadyPending" };

  const { businessName, fullName, phone, category, governorate, city, notes } =
    parsed.data;

  // Upsert: first-time applicants create a row; previously-rejected ones reuse
  // it and reset the review fields so the queue shows a fresh PENDING request.
  await prisma.merchantApplication.upsert({
    where: { userId },
    create: {
      userId,
      businessName,
      fullName,
      phone,
      category,
      governorate,
      city,
      notes: notes || null,
    },
    update: {
      businessName,
      fullName,
      phone,
      category,
      governorate,
      city,
      notes: notes || null,
      status: "PENDING",
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/merchants`);
  return { ok: true };
}

// Admin review of a merchant application. Approve = grant the MERCHANT role and
// create (or reactivate) the MerchantProfile; reject = mark REJECTED with an
// optional note (the applicant may resubmit). Both are audited. Role-granting
// lives ONLY here, behind the admin gate.
export async function reviewMerchantApplication(
  formData: FormData,
): Promise<void> {
  const adminId = await requireAdminId();
  if (!adminId) return;

  const applicationId = String(formData.get("applicationId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();
  if (!applicationId || (decision !== "approve" && decision !== "reject"))
    return;

  const application = await prisma.merchantApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      userId: true,
      businessName: true,
      phone: true,
      category: true,
      governorate: true,
      city: true,
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
    const roles: Role[] = applicant.roles.includes("MERCHANT")
      ? applicant.roles
      : [...applicant.roles, "MERCHANT"];

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: application.userId },
        data: { roles: { set: roles } },
      });
      // A re-approval reactivates/updates the applicant's existing profile
      // (ownerId is unique) rather than duplicating; a first approval mints a
      // unique slug for the public pay URL.
      const existing = await tx.merchantProfile.findUnique({
        where: { ownerId: application.userId },
        select: { id: true },
      });
      const fields = {
        businessName: application.businessName,
        category: application.category,
        phone: application.phone,
        governorate: application.governorate,
        city: application.city,
      };
      if (existing) {
        await tx.merchantProfile.update({
          where: { id: existing.id },
          data: { ...fields, status: "ACTIVE" },
        });
      } else {
        await tx.merchantProfile.create({
          data: {
            ownerId: application.userId,
            slug: await uniqueMerchantSlug(application.businessName, tx),
            ...fields,
          },
        });
      }
      await tx.merchantApplication.update({
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
          action: "merchant.approve",
          entity: "MerchantApplication",
          entityId: applicationId,
          meta: reviewNote ? { reviewNote } : undefined,
        },
      });
    });
  } else {
    await prisma.$transaction([
      prisma.merchantApplication.update({
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
          action: "merchant.reject",
          entity: "MerchantApplication",
          entityId: applicationId,
          meta: reviewNote ? { reviewNote } : undefined,
        },
      }),
    ]);
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/merchants`);
}

// Admin toggles a merchant's status. Suspending pauses the merchant app and
// blocks new payments (requireMerchant + payMerchant both re-check ACTIVE),
// without removing the role — so it can be lifted later.
export async function setMerchantStatus(formData: FormData): Promise<void> {
  const adminId = await requireAdminId();
  if (!adminId) return;

  const merchantId = String(formData.get("merchantId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!merchantId || (status !== "ACTIVE" && status !== "SUSPENDED")) return;

  const merchant = await prisma.merchantProfile.findUnique({
    where: { id: merchantId },
    select: { id: true },
  });
  if (!merchant) return;

  await prisma.$transaction([
    prisma.merchantProfile.update({
      where: { id: merchantId },
      data: { status },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: status === "ACTIVE" ? "merchant.activate" : "merchant.suspend",
        entity: "MerchantProfile",
        entityId: merchantId,
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/merchants`);
}
