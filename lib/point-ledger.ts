// Delivery-point earnings reconciliation. A point earns a flat handling fee
// for each routed parcel that reaches DELIVERED; payouts are cash Hezalli
// paid the operator. Everything is a signed row in DeliveryPointLedgerEntry
// so a plain SUM is the balance Hezalli still owes the point.
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Credit the handling fee for a delivered parcel, inside the caller's
// transaction. No-op for zero amounts.
export async function recordPointHandlingFee(
  tx: Prisma.TransactionClient,
  input: {
    pointId: string;
    subOrderId: string;
    shipmentId?: string | null;
    fee: number;
  },
): Promise<void> {
  if (input.fee <= 0) return;
  await tx.deliveryPointLedgerEntry.create({
    data: {
      pointId: input.pointId,
      type: "HANDLING_FEE",
      amountUsd: input.fee,
      subOrderId: input.subOrderId,
      shipmentId: input.shipmentId ?? null,
    },
  });
}

export type PointLedgerSummary = {
  balance: number; // fees − payouts (± adjustments): what Hezalli owes the point
  totalFees: number;
  totalPaidOut: number;
};

// Reconcile one point's ledger into the headline figures.
export async function pointLedgerSummary(
  pointId: string,
): Promise<PointLedgerSummary> {
  const grouped = await prisma.deliveryPointLedgerEntry.groupBy({
    by: ["type"],
    where: { pointId },
    _sum: { amountUsd: true },
  });
  const sum = (t: string) =>
    Number(grouped.find((g) => g.type === t)?._sum.amountUsd ?? 0);

  const fees = sum("HANDLING_FEE");
  const payouts = sum("PAYOUT"); // stored negative
  const adjustment = sum("ADJUSTMENT");
  return {
    balance: round2(fees + payouts + adjustment),
    totalFees: round2(fees),
    totalPaidOut: round2(-payouts),
  };
}

function round2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v; // normalize -0 → 0
}
