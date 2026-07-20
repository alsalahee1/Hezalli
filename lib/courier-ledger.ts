// Courier cash + earnings reconciliation. COD cash a driver collects on
// delivery is money they hold on behalf of Hezalli until they remit it to the
// office; earnings are delivery fees Hezalli owes the driver. Everything is a
// signed row in CourierLedgerEntry so a plain SUM reconciles.
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Write the ledger rows for a completed courier delivery, inside the caller's
// transaction. COD_COLLECTED only when the buyer paid cash; EARNING whenever a
// Hezalli courier completed the drop. No-ops for zero amounts.
export async function recordDeliveryLedger(
  tx: Prisma.TransactionClient,
  input: {
    courierId: string;
    subOrderId: string;
    shipmentId?: string | null;
    codAmount: number; // buyer cash collected (0 for prepaid)
    fee: number; // driver's delivery fee
  },
): Promise<void> {
  const rows: Prisma.CourierLedgerEntryCreateManyInput[] = [];
  if (input.codAmount > 0) {
    rows.push({
      courierId: input.courierId,
      type: "COD_COLLECTED",
      amountUsd: input.codAmount,
      subOrderId: input.subOrderId,
      shipmentId: input.shipmentId ?? null,
    });
  }
  if (input.fee > 0) {
    rows.push({
      courierId: input.courierId,
      type: "EARNING",
      amountUsd: input.fee,
      subOrderId: input.subOrderId,
      shipmentId: input.shipmentId ?? null,
    });
  }
  if (rows.length) await tx.courierLedgerEntry.createMany({ data: rows });
}

export type CourierCashSummary = {
  cashOnHand: number; // collected − remitted (± adjustments): what the driver still holds
  totalCollected: number;
  totalRemitted: number;
  earnings: number; // delivery fees owed to the driver
};

// Reconcile one courier's ledger into the headline figures.
export async function courierCashSummary(
  courierId: string,
): Promise<CourierCashSummary> {
  const grouped = await prisma.courierLedgerEntry.groupBy({
    by: ["type"],
    where: { courierId },
    _sum: { amountUsd: true },
  });
  const sum = (t: string) =>
    Number(grouped.find((g) => g.type === t)?._sum.amountUsd ?? 0);

  const collected = sum("COD_COLLECTED");
  const remitted = sum("REMITTANCE"); // stored negative
  const adjustment = sum("ADJUSTMENT");
  return {
    cashOnHand: round2(collected + remitted + adjustment),
    totalCollected: round2(collected),
    totalRemitted: round2(-remitted),
    earnings: round2(sum("EARNING")),
  };
}

function round2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v; // normalize -0 → 0
}
