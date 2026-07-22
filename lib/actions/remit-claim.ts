"use server";

// Digital COD remittance (docs §38): instead of traveling to hand cash in, a
// courier or point transfers it over a rail (Jawali/Jaib/Floosak/Kuraimi/
// bank) and submits the reference here. Nothing moves on the ledger until a
// delivery manager verifies the transfer — the APPROVED flip writes the
// REMITTANCE / COD_REMITTANCE row in the same transaction, with the
// over-remit guard re-checked at approval time (cash may have changed since
// the claim was filed). Mirrors the wallet top-up manual-confirm flow.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import {
  requireCourierId,
  requireDeliveryManagerId,
  requireDeliveryPoint,
} from "@/lib/authz";
import { courierCashSummary } from "@/lib/courier-ledger";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";
import { REMIT_METHODS } from "@/lib/remit-methods";

type Result = { ok?: boolean; error?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseClaim(formData: FormData): {
  amount: number;
  method: string;
  reference: string;
} | null {
  const amount = round2(Number(formData.get("amount")));
  const method = String(formData.get("method") ?? "");
  const reference = String(formData.get("reference") ?? "")
    .trim()
    .slice(0, 120);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!(REMIT_METHODS as readonly string[]).includes(method)) return null;
  if (reference.length < 3) return null;
  return { amount, method, reference };
}

/** Courier files a claim for (part of) the COD cash they hold. */
export async function submitCourierRemitClaim(
  formData: FormData,
): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  const claim = parseClaim(formData);
  if (!claim) return { error: "badInput" };

  const open = await prisma.remitClaim.count({
    where: { courierId, status: "PENDING" },
  });
  if (open > 0) return { error: "alreadyOpen" };

  const cash = await courierCashSummary(courierId);
  if (claim.amount > cash.cashOnHand + 0.005) return { error: "overRemit" };

  await prisma.remitClaim.create({
    data: {
      courierId,
      amountUsd: claim.amount,
      method: claim.method,
      reference: claim.reference,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/driver/ledger`);
  revalidatePath(`/${locale}/delivery-manager/remittances`);
  return { ok: true };
}

/** Point operator files a claim for (part of) the cash the hub holds. */
export async function submitPointRemitClaim(
  formData: FormData,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const claim = parseClaim(formData);
  if (!claim) return { error: "badInput" };

  const open = await prisma.remitClaim.count({
    where: { pointId: gate.pointId, status: "PENDING" },
  });
  if (open > 0) return { error: "alreadyOpen" };

  const summary = await pointLedgerSummary(gate.pointId);
  if (claim.amount > summary.cashOnHand + 0.005) return { error: "overRemit" };

  await prisma.remitClaim.create({
    data: {
      pointId: gate.pointId,
      amountUsd: claim.amount,
      method: claim.method,
      reference: claim.reference,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/point/ledger`);
  revalidatePath(`/${locale}/delivery-manager/remittances`);
  return { ok: true };
}

async function revalidateQueue(locale: string) {
  revalidatePath(`/${locale}/delivery-manager/remittances`);
  revalidatePath(`/${locale}/delivery-manager/couriers`);
  revalidatePath(`/${locale}/delivery-manager/points`);
  revalidatePath(`/${locale}/admin/couriers`);
  revalidatePath(`/${locale}/admin/points`);
}

/** Staff verified the transfer arrived → settle the ledger. */
export async function approveRemitClaim(claimId: string): Promise<Result> {
  const staffId = await requireDeliveryManagerId();
  if (!staffId) return { error: "forbidden" };
  const locale = await getLocale();

  const claim = await prisma.remitClaim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      method: true,
      reference: true,
      courierId: true,
      pointId: true,
      point: { select: { ownerId: true } },
    },
  });
  if (!claim) return { error: "notFound" };
  if (claim.status !== "PENDING") return { error: "badState" };
  const amount = Number(claim.amountUsd);

  // Cash may have been settled another way since the claim was filed — the
  // ledger row must never overdraw what the sender still holds.
  if (claim.courierId) {
    const cash = await courierCashSummary(claim.courierId);
    if (amount > cash.cashOnHand + 0.005) return { error: "overRemit" };
  } else if (claim.pointId) {
    const summary = await pointLedgerSummary(claim.pointId);
    if (amount > summary.cashOnHand + 0.005) return { error: "overRemit" };
  } else {
    return { error: "badState" };
  }

  const note = `Digital remittance — ${claim.method} ${claim.reference}`;
  let approved = false;
  await prisma.$transaction(async (tx) => {
    // The conditional flip is the double-settle guard.
    const upd = await tx.remitClaim.updateMany({
      where: { id: claim.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedBy: staffId,
        processedAt: new Date(),
      },
    });
    if (upd.count !== 1) return; // decided concurrently
    if (claim.courierId) {
      await tx.courierLedgerEntry.create({
        data: {
          courierId: claim.courierId,
          type: "REMITTANCE",
          amountUsd: -amount,
          note,
          createdById: staffId,
        },
      });
    } else {
      await tx.deliveryPointLedgerEntry.create({
        data: {
          pointId: claim.pointId!,
          type: "COD_REMITTANCE",
          amountUsd: -amount,
          note,
          createdById: staffId,
        },
      });
    }
    await tx.notification.create({
      data: {
        userId: claim.courierId ?? claim.point!.ownerId,
        type: "PAYMENT",
        title: "Remittance confirmed",
        body: `Your ${amount.toFixed(2)} USD transfer (${claim.method}) was confirmed — your cash balance is settled.`,
        data: { link: claim.courierId ? "/driver/ledger" : "/point/ledger" },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: staffId,
        action: "remitClaim.approve",
        entity: "RemitClaim",
        entityId: claim.id,
        meta: {
          amountUsd: amount,
          method: claim.method,
          reference: claim.reference,
          courierId: claim.courierId ?? undefined,
          pointId: claim.pointId ?? undefined,
        },
      },
    });
    approved = true;
  });
  if (!approved) return { error: "badState" };

  await revalidateQueue(locale);
  revalidatePath(`/${locale}/driver/ledger`);
  revalidatePath(`/${locale}/point/ledger`);
  return { ok: true };
}

/** Transfer not found / wrong amount → the claimant keeps owing the cash. */
export async function rejectRemitClaim(
  claimId: string,
  reason: string,
): Promise<Result> {
  const staffId = await requireDeliveryManagerId();
  if (!staffId) return { error: "forbidden" };
  const locale = await getLocale();

  const claim = await prisma.remitClaim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      courierId: true,
      pointId: true,
      point: { select: { ownerId: true } },
    },
  });
  if (!claim) return { error: "notFound" };
  if (claim.status !== "PENDING") return { error: "badState" };

  const cleanReason = reason.trim().slice(0, 300);
  let rejected = false;
  await prisma.$transaction(async (tx) => {
    const upd = await tx.remitClaim.updateMany({
      where: { id: claim.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedBy: staffId,
        reviewNote: cleanReason || null,
        processedAt: new Date(),
      },
    });
    if (upd.count !== 1) return;
    await tx.notification.create({
      data: {
        userId: claim.courierId ?? claim.point!.ownerId,
        type: "PAYMENT",
        title: "Remittance rejected",
        body: cleanReason
          ? `Your ${Number(claim.amountUsd).toFixed(2)} USD remittance claim was rejected: ${cleanReason}`
          : `Your ${Number(claim.amountUsd).toFixed(2)} USD remittance claim was rejected.`,
        data: { link: claim.courierId ? "/driver/ledger" : "/point/ledger" },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: staffId,
        action: "remitClaim.reject",
        entity: "RemitClaim",
        entityId: claim.id,
        meta: { reason: cleanReason || undefined },
      },
    });
    rejected = true;
  });
  if (!rejected) return { error: "badState" };

  await revalidateQueue(locale);
  revalidatePath(`/${locale}/driver/ledger`);
  revalidatePath(`/${locale}/point/ledger`);
  return { ok: true };
}
