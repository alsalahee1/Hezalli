"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryScope } from "@/lib/authz";
import { courierCashSummary } from "@/lib/courier-ledger";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Admin records that a courier handed in cash (a remittance) — a negative
// ledger row that reduces the driver's cash-on-hand. Also used for a manual
// ADJUSTMENT (± correction). Both are audited.
export async function recordRemittance(formData: FormData): Promise<Result> {
  const adminId = await requireDeliveryScope("SETTLEMENT");
  if (!adminId) return { error: "forbidden" };

  const courierId = String(formData.get("courierId") ?? "");
  const kind = String(formData.get("kind") ?? "remittance"); // remittance | adjustment
  const raw = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();
  if (!courierId) return { error: "badInput" };

  const courier = await prisma.user.findUnique({
    where: { id: courierId },
    select: { roles: true },
  });
  if (!courier?.roles.includes("COURIER")) return { error: "notCourier" };

  let type: "REMITTANCE" | "ADJUSTMENT";
  let amountUsd: number;
  if (kind === "adjustment") {
    // A signed correction (may be + or −). Reject zero.
    if (!Number.isFinite(raw) || raw === 0) return { error: "badInput" };
    type = "ADJUSTMENT";
    amountUsd = round2(raw);
  } else {
    // A remittance is a positive amount of cash handed in, stored negative.
    if (!Number.isFinite(raw) || raw <= 0) return { error: "badInput" };
    type = "REMITTANCE";
    amountUsd = -round2(raw);
  }

  await prisma.$transaction([
    prisma.courierLedgerEntry.create({
      data: {
        courierId,
        type,
        amountUsd,
        note: note || null,
        createdById: adminId,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action:
          type === "REMITTANCE" ? "courier.remittance" : "courier.adjustment",
        entity: "User",
        entityId: courierId,
        meta: { amountUsd, note: note || undefined },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/couriers/${courierId}`);
  revalidatePath(`/${locale}/admin/couriers`);
  return { ok: true };
}

// Admin pays a courier their accrued delivery-fee earnings — a negative PAYOUT
// row that reduces "earnings owed". Positive amount; audited. Settling more than
// is owed is allowed (advance) but flagged to the caller via `overpaid`.
// Refused while the driver still holds unremitted COD cash — offset that debt
// first (offsetEarningsAgainstCod) so earnings stay the collateral for cash.
export async function recordEarningsPayout(
  formData: FormData,
): Promise<Result & { overpaid?: boolean }> {
  const adminId = await requireDeliveryScope("SETTLEMENT");
  if (!adminId) return { error: "forbidden" };

  const courierId = String(formData.get("courierId") ?? "");
  const raw = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();
  if (!courierId) return { error: "badInput" };
  if (!Number.isFinite(raw) || raw <= 0) return { error: "badInput" };

  const courier = await prisma.user.findUnique({
    where: { id: courierId },
    select: { roles: true },
  });
  if (!courier?.roles.includes("COURIER")) return { error: "notCourier" };

  const cash = await courierCashSummary(courierId);
  if (cash.cashOnHand > 0.005) return { error: "cashOutstanding" };

  const amountUsd = -round2(raw);
  await prisma.$transaction([
    prisma.courierLedgerEntry.create({
      data: {
        courierId,
        type: "PAYOUT",
        amountUsd,
        note: note || null,
        createdById: adminId,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "courier.payout",
        entity: "User",
        entityId: courierId,
        meta: { amountUsd, note: note || undefined },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/couriers/${courierId}`);
  revalidatePath(`/${locale}/admin/couriers`);
  return { ok: true };
}

// Admin settles a driver's COD debt out of their accrued earnings — the
// industry-standard netting (a shortage is deducted from wages, no cash moves).
// One atomic double entry for min(cash held, earnings owed): REMITTANCE (−m)
// clears the cash side, PAYOUT (−m) consumes the earnings that covered it.
export async function offsetEarningsAgainstCod(
  formData: FormData,
): Promise<Result & { offset?: number }> {
  const adminId = await requireDeliveryScope("SETTLEMENT");
  if (!adminId) return { error: "forbidden" };

  const courierId = String(formData.get("courierId") ?? "");
  if (!courierId) return { error: "badInput" };

  const courier = await prisma.user.findUnique({
    where: { id: courierId },
    select: { roles: true },
  });
  if (!courier?.roles.includes("COURIER")) return { error: "notCourier" };

  // Compute the offset INSIDE the transaction under a courier row lock, so a
  // hand-in (or another offset) landing concurrently can't make this one
  // overdraw the cash the driver actually still holds.
  let amount = 0;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${courierId} FOR UPDATE`;
    const grouped = await tx.courierLedgerEntry.groupBy({
      by: ["type"],
      where: { courierId },
      _sum: { amountUsd: true },
    });
    const sum = (t: string) =>
      Number(grouped.find((g) => g.type === t)?._sum.amountUsd ?? 0);
    const cashOnHand =
      sum("COD_COLLECTED") + sum("REMITTANCE") + sum("ADJUSTMENT");
    const earnings = sum("EARNING") + sum("PAYOUT");
    amount = round2(Math.min(cashOnHand, earnings));
    if (amount <= 0) return;

    await tx.courierLedgerEntry.create({
      data: {
        courierId,
        type: "REMITTANCE",
        amountUsd: -amount,
        note: "Settled from earnings (offset)",
        createdById: adminId,
      },
    });
    await tx.courierLedgerEntry.create({
      data: {
        courierId,
        type: "PAYOUT",
        amountUsd: -amount,
        note: "Applied to COD cash (offset)",
        createdById: adminId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: "courier.codOffset",
        entity: "User",
        entityId: courierId,
        meta: { amountUsd: amount },
      },
    });
    await tx.notification.create({
      data: {
        userId: courierId,
        type: "PAYMENT",
        title: "COD settled from earnings",
        body: `${amount.toFixed(2)} USD of your earnings was used to settle COD cash you were holding.`,
        data: { link: "/driver/ledger" },
      },
    });
  });
  if (amount <= 0) return { error: "nothingToOffset" };

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/couriers/${courierId}`);
  revalidatePath(`/${locale}/admin/couriers`);
  return { ok: true, offset: amount };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
