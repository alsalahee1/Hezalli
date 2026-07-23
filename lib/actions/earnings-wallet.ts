"use server";

// Self-service: a courier or a Hezalli Point operator sweeps their accrued
// earnings into their HezalliPay wallet, so they get one balance across
// earning and spending — mirroring the seller sweep in lib/actions/wallet-
// transfer.ts. Each move bridges the two ledgers in one transaction: a negative
// PAYOUT row on the courier/point ledger + an earnings credit on the wallet.
// Neither ledger is refactored.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireCourierId, requireDeliveryPoint } from "@/lib/authz";
import { canMoveEarnings } from "@/lib/point-access";
import { prisma } from "@/lib/prisma";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string; moved?: number };

// Carries an i18n error code out of the reservation transaction so it rolls
// back and maps to a typed result.
class MoveError extends Error {}

const round2 = (n: number) => Math.round(n * 100) / 100;

// The signed courier-ledger rows that make up "earnings owed".
const COURIER_EARNING_TYPES = ["EARNING", "PAYOUT"] as const;
// The signed point-ledger rows that make up the point's earnings balance.
const POINT_EARNING_TYPES = ["HANDLING_FEE", "PAYOUT", "ADJUSTMENT"] as const;

/**
 * Courier moves (part of) their outstanding delivery-fee earnings into their
 * wallet. Writes a PAYOUT debit on the courier ledger + a COURIER_EARNINGS
 * credit on the wallet, under a row lock so two concurrent "move all"
 * submissions can't both pass the check and over-draw the earnings owed.
 */
export async function transferCourierEarningsToWallet(
  amountUsd?: number,
): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  const walletId = await getWalletId(courierId);

  let moved = 0;
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize this courier's self-service moves.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${courierId} FOR UPDATE`;
      // Earnings are collateral for COD cash (docs §32): unremitted cash is
      // withheld here exactly as it is from admin payouts, so the sweep can't
      // be used to slip earnings out from under a cash debt.
      const [agg, cashAgg] = await Promise.all([
        tx.courierLedgerEntry.aggregate({
          where: { courierId, type: { in: [...COURIER_EARNING_TYPES] } },
          _sum: { amountUsd: true },
        }),
        tx.courierLedgerEntry.aggregate({
          where: {
            courierId,
            type: { in: ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT"] },
          },
          _sum: { amountUsd: true },
        }),
      ]);
      const cashHeld = Math.max(0, round2(Number(cashAgg._sum.amountUsd ?? 0)));
      const free = round2(Number(agg._sum.amountUsd ?? 0) - cashHeld);
      if (free <= 0)
        throw new MoveError(cashHeld > 0 ? "cashOutstanding" : "nothingToMove");
      const amount = amountUsd && amountUsd > 0 ? round2(amountUsd) : free;
      // amount can round to 0 (e.g. 0.004) — refuse rather than write 0-rows.
      if (amount <= 0) throw new MoveError("nothingToMove");
      if (amount > free)
        throw new MoveError(cashHeld > 0 ? "cashOutstanding" : "insufficient");

      // Debit the courier ledger (reduces earnings owed).
      await tx.courierLedgerEntry.create({
        data: {
          courierId,
          type: "PAYOUT",
          amountUsd: -amount,
          note: "Moved to HezalliPay wallet",
        },
      });
      // Credit the wallet.
      await creditWalletTx(tx, walletId, {
        type: "COURIER_EARNINGS",
        amountUsd: amount,
        note: "Moved from delivery earnings",
      });
      moved = amount;
    });
  } catch (e) {
    if (e instanceof MoveError) return { error: e.message };
    throw e;
  }
  if (moved <= 0) return { error: "nothingToMove" };

  await recomputeWalletBalance(courierId);

  const locale = await getLocale();
  revalidatePath(`/${locale}/driver/ledger`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true, moved };
}

/**
 * Point operator moves (part of) their earnings balance into their wallet.
 * Reserves against outstanding payout requests (same rule as requestPointPayout)
 * so a wallet move racing a pending payout can't double-spend the balance.
 */
export async function transferPointEarningsToWallet(
  amountUsd?: number,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  // Owner only: this credits the CALLER's wallet, so an employee triggering
  // it would move the hub's earnings into their own pocket.
  if (!gate || !canMoveEarnings(gate.access)) return { error: "forbidden" };
  const walletId = await getWalletId(gate.userId);

  let moved = 0;
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize concurrent moves/requests for the same hub.
      await tx.$queryRaw`SELECT "id" FROM "DeliveryPoint" WHERE "id" = ${gate.pointId} FOR UPDATE`;
      // Reserve against payout requests already claiming this balance. Read the
      // requests BEFORE the ledger: markPointPayoutPaid flips a request to PAID
      // and writes its ledger debit in one commit without taking the point lock,
      // and under READ COMMITTED each statement sees a fresh snapshot — in this
      // order a flip landing between the reads is counted twice (still reserved
      // AND already debited) so the sweep fails closed instead of double-paying.
      const outstanding = await tx.pointPayoutRequest.aggregate({
        where: {
          pointId: gate.pointId,
          status: { in: ["REQUESTED", "APPROVED"] },
        },
        _sum: { amountUsd: true },
      });
      // Held COD cash is withheld too (docs §32) — same net-settlement rule
      // as requestPointPayout, so the sweep can't bypass it.
      const [agg, cashAgg] = await Promise.all([
        tx.deliveryPointLedgerEntry.aggregate({
          where: {
            pointId: gate.pointId,
            type: { in: [...POINT_EARNING_TYPES] },
          },
          _sum: { amountUsd: true },
        }),
        tx.deliveryPointLedgerEntry.aggregate({
          where: {
            pointId: gate.pointId,
            type: { in: ["COD_COLLECTED", "DRIVER_CASH_IN", "COD_REMITTANCE"] },
          },
          _sum: { amountUsd: true },
        }),
      ]);
      const cashHeld = Math.max(0, round2(Number(cashAgg._sum.amountUsd ?? 0)));
      const balance = round2(Number(agg._sum.amountUsd ?? 0));
      const free = round2(
        balance - Number(outstanding._sum.amountUsd ?? 0) - cashHeld,
      );
      if (free <= 0)
        throw new MoveError(cashHeld > 0 ? "cashOutstanding" : "nothingToMove");
      const amount = amountUsd && amountUsd > 0 ? round2(amountUsd) : free;
      // amount can round to 0 (e.g. 0.004) — refuse rather than write 0-rows.
      if (amount <= 0) throw new MoveError("nothingToMove");
      if (amount > free)
        throw new MoveError(cashHeld > 0 ? "cashOutstanding" : "insufficient");

      // Debit the point ledger (reduces earnings owed).
      await tx.deliveryPointLedgerEntry.create({
        data: {
          pointId: gate.pointId,
          type: "PAYOUT",
          amountUsd: -amount,
          note: "Moved to HezalliPay wallet",
        },
      });
      // Credit the wallet.
      await creditWalletTx(tx, walletId, {
        type: "POINT_EARNINGS",
        amountUsd: amount,
        note: "Moved from point earnings",
      });
      moved = amount;
    });
  } catch (e) {
    if (e instanceof MoveError) return { error: e.message };
    throw e;
  }
  if (moved <= 0) return { error: "nothingToMove" };

  await recomputeWalletBalance(gate.userId);

  const locale = await getLocale();
  revalidatePath(`/${locale}/point/ledger`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true, moved };
}
