// HezalliPay wallet core (Step 19.1). The ledger is the source of truth:
// Wallet.availableUsd is always the sum of that wallet's entries, and entries
// are immutable — the balance is recomputed, never edited in place. All amounts
// are USD (USDT treated 1:1), matching the seller ledger in lib/finance.ts.
// See docs/19-wallet-strategy.md.
import { round2 } from "@/lib/finance";
import type { Prisma, WalletEntryType } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

/** Ensure a Wallet row exists for a user, return its id. */
export async function getWalletId(
  userId: string,
  client: Tx | typeof prisma = prisma,
): Promise<string> {
  const wallet = await client.wallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
  return wallet.id;
}

/**
 * Recompute a wallet's availableUsd (= Σ entries). Call after committing the
 * transaction that wrote the entries, exactly as recomputeBalance does for
 * sellers.
 */
export async function recomputeWalletBalance(userId: string): Promise<void> {
  const walletId = await getWalletId(userId);
  // availableUsd = Σ entries, set in a single statement so a concurrent debit
  // can never be lost to a read-then-write window that would resurrect spent
  // funds (entry amounts are stored at 2 decimal places, so SUM is exact).
  await prisma.$executeRaw`
    UPDATE "Wallet"
    SET "availableUsd" = COALESCE(
      (SELECT SUM("amountUsd") FROM "WalletEntry" WHERE "walletId" = ${walletId}),
      0
    )
    WHERE "id" = ${walletId}`;
}

/**
 * Write one immutable wallet entry inside an existing transaction. Positive
 * amounts credit the wallet, negative debit it. The caller is responsible for
 * calling recomputeWalletBalance(userId) once the transaction commits.
 */
export async function creditWalletTx(
  tx: Tx,
  walletId: string,
  input: {
    type: WalletEntryType;
    amountUsd: number;
    orderId?: string | null;
    subOrderId?: string | null;
    note?: string | null;
    // Source record this entry came from, so a receipt/detail can enrich it.
    refType?: "transfer" | "bill" | "topup" | "withdrawal" | null;
    refId?: string | null;
  },
): Promise<void> {
  await tx.walletEntry.create({
    data: {
      walletId,
      type: input.type,
      amountUsd: round2(input.amountUsd),
      orderId: input.orderId ?? null,
      subOrderId: input.subOrderId ?? null,
      note: input.note ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
    },
  });
}

/** Read a user's current balance + recent entries for the account page. */
export async function getWalletView(userId: string, take = 50) {
  const walletId = await getWalletId(userId);
  const [wallet, entries] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { availableUsd: true, frozen: true },
    }),
    prisma.walletEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);
  return {
    balance: Number(wallet.availableUsd),
    frozen: wallet.frozen,
    entries,
  };
}

/** Lifetime money-in vs money-out totals for the wallet stats tiles. */
export async function getWalletStats(
  userId: string,
): Promise<{ totalIn: number; totalOut: number }> {
  const walletId = await getWalletId(userId);
  const [inAgg, outAgg] = await Promise.all([
    prisma.walletEntry.aggregate({
      where: { walletId, amountUsd: { gt: 0 } },
      _sum: { amountUsd: true },
    }),
    prisma.walletEntry.aggregate({
      where: { walletId, amountUsd: { lt: 0 } },
      _sum: { amountUsd: true },
    }),
  ]);
  return {
    totalIn: round2(Number(inAgg._sum.amountUsd ?? 0)),
    totalOut: round2(Math.abs(Number(outAgg._sum.amountUsd ?? 0))),
  };
}
