"use server";

// Point payout requests (docs/DELIVERY-POINTS.md §22), mirroring the seller
// flow in lib/actions/payout.ts: the operator requests against their FREE
// earnings balance (ledger sum minus outstanding requests) under a row lock,
// and the admin's PAID flip writes the negative PAYOUT ledger entry in the
// same transaction so the queue and the ledger can never disagree.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryScope, requireDeliveryPoint } from "@/lib/authz";
import { canMoveEarnings } from "@/lib/point-access";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

type Result = { ok?: boolean; error?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

class GuardError extends Error {}

const EARNING_TYPES = ["HANDLING_FEE", "PAYOUT", "ADJUSTMENT"] as const;
const CASH_TYPES = [
  "COD_COLLECTED",
  "DRIVER_CASH_IN",
  "COD_REMITTANCE",
] as const;

/**
 * Operator asks to be paid `amountUsd` (or their whole free balance). Net
 * settlement (docs §32): unremitted COD cash the point holds for Hezalli is
 * withheld from the payable balance — a hub sitting on cash gets paid only
 * what remains after that cash is covered.
 */
export async function requestPointPayout(amountUsd?: number): Promise<Result> {
  const gate = await requireDeliveryPoint();
  // Owner only: the payout goes to the owner, so no employee may request it.
  if (!gate || !canMoveEarnings(gate.access)) return { error: "forbidden" };
  const locale = await getLocale();
  const min = await getSetting("min_payout_usd");

  try {
    await prisma.$transaction(async (tx) => {
      // Serialize concurrent requests for the same hub.
      await tx.$queryRaw`SELECT "id" FROM "DeliveryPoint" WHERE "id" = ${gate.pointId} FOR UPDATE`;
      const open = await tx.pointPayoutRequest.count({
        where: {
          pointId: gate.pointId,
          status: { in: ["REQUESTED", "APPROVED"] },
        },
      });
      if (open > 0) throw new GuardError("alreadyOpen");
      const [agg, cashAgg] = await Promise.all([
        tx.deliveryPointLedgerEntry.aggregate({
          where: { pointId: gate.pointId, type: { in: [...EARNING_TYPES] } },
          _sum: { amountUsd: true },
        }),
        tx.deliveryPointLedgerEntry.aggregate({
          where: { pointId: gate.pointId, type: { in: [...CASH_TYPES] } },
          _sum: { amountUsd: true },
        }),
      ]);
      const cashHeld = Math.max(0, round2(Number(cashAgg._sum.amountUsd ?? 0)));
      const free = round2(Number(agg._sum.amountUsd ?? 0) - cashHeld);
      const amount =
        amountUsd && amountUsd > 0 ? round2(amountUsd) : round2(free);
      if (amount < min) throw new GuardError("belowMin");
      if (amount > free)
        throw new GuardError(cashHeld > 0 ? "cashOutstanding" : "insufficient");
      await tx.pointPayoutRequest.create({
        data: { pointId: gate.pointId, amountUsd: amount },
      });
    });
  } catch (e) {
    if (e instanceof GuardError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/${locale}/point/ledger`);
  revalidatePath(`/${locale}/admin/points/${gate.pointId}`);
  return { ok: true };
}

/** Admin marks a request PAID (money sent outside the system) → ledger debit. */
export async function markPointPayoutPaid(
  requestId: string,
  reference: string,
): Promise<Result> {
  const adminId = await requireDeliveryScope("SETTLEMENT");
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const req = await prisma.pointPayoutRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      pointId: true,
      point: {
        select: { name: true, owner: { select: { id: true, locale: true } } },
      },
    },
  });
  if (!req) return { error: "notFound" };
  if (req.status !== "REQUESTED" && req.status !== "APPROVED")
    return { error: "badState" };

  const amount = Number(req.amountUsd);
  let paid = false;
  await prisma.$transaction(async (tx) => {
    // The conditional flip is the real double-pay guard.
    const upd = await tx.pointPayoutRequest.updateMany({
      where: { id: req.id, status: { in: ["REQUESTED", "APPROVED"] } },
      data: { status: "PAID", processedBy: adminId, processedAt: new Date() },
    });
    if (upd.count !== 1) return; // paid/rejected concurrently
    await tx.deliveryPointLedgerEntry.create({
      data: {
        pointId: req.pointId,
        type: "PAYOUT",
        amountUsd: -amount,
        note: reference ? `Payout paid — ${reference}` : "Payout paid",
        createdById: adminId,
      },
    });
    const ar = req.point.owner.locale === "ar";
    await tx.notification.create({
      data: {
        userId: req.point.owner.id,
        type: "PAYMENT",
        title: ar ? "تم صرف السحب" : "Payout paid",
        body: ar
          ? `تم تحويل ${amount.toFixed(2)}$ لنقطة ${req.point.name}.`
          : `$${amount.toFixed(2)} has been sent for ${req.point.name}.`,
        data: { pointPayoutId: req.id },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: "point.payout",
        entity: "PointPayoutRequest",
        entityId: req.id,
        meta: { pointId: req.pointId, amountUsd: -amount, reference },
      },
    });
    paid = true;
  });
  if (!paid) return { error: "badState" };

  revalidatePath(`/${locale}/admin/points/${req.pointId}`);
  revalidatePath(`/${locale}/point/ledger`);
  return { ok: true };
}

/** Admin rejects a request (no ledger effect); the reason reaches the hub. */
export async function rejectPointPayout(
  requestId: string,
  reason: string,
): Promise<Result> {
  const adminId = await requireDeliveryScope("SETTLEMENT");
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const req = await prisma.pointPayoutRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      amountUsd: true,
      pointId: true,
      point: { select: { owner: { select: { id: true, locale: true } } } },
    },
  });
  if (!req) return { error: "notFound" };
  if (req.status !== "REQUESTED" && req.status !== "APPROVED")
    return { error: "badState" };

  const cleanReason = reason.trim().slice(0, 300);
  let rejected = false;
  await prisma.$transaction(async (tx) => {
    const upd = await tx.pointPayoutRequest.updateMany({
      where: { id: req.id, status: { in: ["REQUESTED", "APPROVED"] } },
      data: {
        status: "REJECTED",
        processedBy: adminId,
        processedAt: new Date(),
        note: cleanReason || null,
      },
    });
    if (upd.count !== 1) return;
    const ar = req.point.owner.locale === "ar";
    await tx.notification.create({
      data: {
        userId: req.point.owner.id,
        type: "PAYMENT",
        title: ar ? "رُفض طلب السحب" : "Payout request rejected",
        body: cleanReason
          ? ar
            ? `رُفض طلب سحب ${Number(req.amountUsd).toFixed(2)}$: ${cleanReason}`
            : `Your $${Number(req.amountUsd).toFixed(2)} payout request was rejected: ${cleanReason}`
          : ar
            ? `رُفض طلب سحب ${Number(req.amountUsd).toFixed(2)}$.`
            : `Your $${Number(req.amountUsd).toFixed(2)} payout request was rejected.`,
        data: { pointPayoutId: req.id },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: "point.payoutReject",
        entity: "PointPayoutRequest",
        entityId: req.id,
        meta: { pointId: req.pointId, reason: cleanReason || undefined },
      },
    });
    rejected = true;
  });
  if (!rejected) return { error: "badState" };

  revalidatePath(`/${locale}/admin/points/${req.pointId}`);
  revalidatePath(`/${locale}/point/ledger`);
  return { ok: true };
}
