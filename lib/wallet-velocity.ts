// Outflow velocity limits (Step 19.10). Caps how much money can LEAVE a wallet
// over rolling 24h / 30d windows — a core anti-fraud / AML control that bounds
// the damage from a compromised account. NOT a server action: callers pass the
// authenticated user id, and every outflow checks this before moving money.
//
// "Outflow" = money that leaves the wallet to another party or off-platform:
// P2P sends, cash-outs, and bill/airtime purchases. Order payments to sellers
// stay inside the platform and are not counted here.
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/finance";
import { getPlatformSettings } from "@/lib/settings";
import type { Prisma, WalletEntryType } from "@/lib/generated/prisma/client";

// VERIFIED users get a higher ceiling, mirroring the top-up cap tiering.
const VERIFIED_MULTIPLIER = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

const OUTFLOW_TYPES: WalletEntryType[] = [
  "TRANSFER_OUT",
  "CASHOUT",
  "BILL_PAYMENT",
  "AIRTIME_TOPUP",
];

export type VelocityResult = {
  ok?: boolean;
  error?: "dailyLimit" | "monthlyLimit";
};

// Sum of outflow debits (as a positive number) since `since` for this wallet.
async function outflowSince(walletId: string, since: Date): Promise<number> {
  const agg = await prisma.walletEntry.aggregate({
    where: {
      walletId,
      type: { in: OUTFLOW_TYPES },
      createdAt: { gte: since },
    },
    _sum: { amountUsd: true },
  });
  return Math.abs(round2(Number(agg._sum.amountUsd ?? 0)));
}

/**
 * Check whether moving `amountUsd` out now would breach the rolling daily or
 * monthly cap. A cap of 0 (or less) means "no limit". Returns a typed error.
 */
export async function checkOutflowLimit(
  userId: string,
  amountUsd: number,
): Promise<VelocityResult> {
  const amount = round2(Number(amountUsd));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: true };

  const [settings, wallet, profile] = await Promise.all([
    getPlatformSettings(),
    prisma.wallet.findUnique({ where: { userId }, select: { id: true } }),
    prisma.sellerProfile.findUnique({
      where: { userId },
      select: { kycStatus: true },
    }),
  ]);
  if (!wallet) return { ok: true };

  const mult = profile?.kycStatus === "VERIFIED" ? VERIFIED_MULTIPLIER : 1;
  const dailyCap = settings.wallet_daily_outflow_usd * mult;
  const monthlyCap = settings.wallet_monthly_outflow_usd * mult;
  const now = Date.now();

  if (dailyCap > 0) {
    const used = await outflowSince(wallet.id, new Date(now - DAY_MS));
    if (used + amount > dailyCap) return { error: "dailyLimit" };
  }
  if (monthlyCap > 0) {
    const used = await outflowSince(wallet.id, new Date(now - MONTH_MS));
    if (used + amount > monthlyCap) return { error: "monthlyLimit" };
  }
  return { ok: true };
}

// Thrown by the in-transaction guard; the reason maps to the same i18n keys as
// the pre-flight check above.
export class VelocityError extends Error {
  constructor(public reason: "dailyLimit" | "monthlyLimit") {
    super(reason);
  }
}

/** The daily/monthly outflow caps for a user (0 = no limit), honoring KYC tier. */
export async function outflowCaps(
  userId: string,
): Promise<{ daily: number; monthly: number }> {
  const [settings, profile] = await Promise.all([
    getPlatformSettings(),
    prisma.sellerProfile.findUnique({
      where: { userId },
      select: { kycStatus: true },
    }),
  ]);
  const mult = profile?.kycStatus === "VERIFIED" ? VERIFIED_MULTIPLIER : 1;
  return {
    daily: settings.wallet_daily_outflow_usd * mult,
    monthly: settings.wallet_monthly_outflow_usd * mult,
  };
}

/**
 * Authoritative velocity guard, run INSIDE the outflow transaction. The caller
 * must already hold a row lock on the wallet (`SELECT … FOR UPDATE`) so that
 * concurrent outflows serialize and this reads their committed debits. Throws a
 * VelocityError on breach — unlike the pre-flight `checkOutflowLimit`, this
 * cannot be raced past. Call it BEFORE writing this outflow's own debit entry.
 */
export async function assertOutflowWithinLimitTx(
  tx: Prisma.TransactionClient,
  walletId: string,
  caps: { daily: number; monthly: number },
  amountUsd: number,
): Promise<void> {
  const amount = round2(Number(amountUsd));
  if (!Number.isFinite(amount) || amount <= 0) return;
  const now = Date.now();
  const sumSince = async (since: Date) => {
    const agg = await tx.walletEntry.aggregate({
      where: {
        walletId,
        type: { in: OUTFLOW_TYPES },
        createdAt: { gte: since },
      },
      _sum: { amountUsd: true },
    });
    return Math.abs(round2(Number(agg._sum.amountUsd ?? 0)));
  };
  if (
    caps.daily > 0 &&
    (await sumSince(new Date(now - DAY_MS))) + amount > caps.daily
  ) {
    throw new VelocityError("dailyLimit");
  }
  if (
    caps.monthly > 0 &&
    (await sumSince(new Date(now - MONTH_MS))) + amount > caps.monthly
  ) {
    throw new VelocityError("monthlyLimit");
  }
}
