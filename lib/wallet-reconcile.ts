// Wallet liability + ledger-integrity reconciliation (Step 19.11). For a real
// e-money book the platform must be able to prove, on demand, that (a) it knows
// its total outstanding wallet liability and (b) every wallet's stored balance
// still equals the sum of its immutable entries (the invariant HezalliPay is
// built on). This module powers the admin audit page.
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

export type LiabilitySummary = {
  totalLiability: number; // Σ every wallet's availableUsd (what we owe users)
  ledgerTotal: number; // Σ every wallet entry (should equal totalLiability)
  walletCount: number;
  drift: number; // totalLiability − ledgerTotal (0 when fully consistent)
};

export type DriftedWallet = {
  userId: string;
  name: string;
  stored: number; // wallet.availableUsd
  computed: number; // Σ entries
  diff: number; // stored − computed
};

// Cents tolerance below which a wallet is considered consistent.
const EPSILON = 0.005;

/** Platform-wide liability + whether the ledger totals reconcile. */
export async function getWalletLiability(): Promise<LiabilitySummary> {
  const [walletAgg, entryAgg, walletCount] = await Promise.all([
    prisma.wallet.aggregate({ _sum: { availableUsd: true } }),
    prisma.walletEntry.aggregate({ _sum: { amountUsd: true } }),
    prisma.wallet.count(),
  ]);
  const totalLiability = round2(Number(walletAgg._sum.availableUsd ?? 0));
  const ledgerTotal = round2(Number(entryAgg._sum.amountUsd ?? 0));
  return {
    totalLiability,
    ledgerTotal,
    walletCount,
    drift: round2(totalLiability - ledgerTotal),
  };
}

/**
 * Wallets whose stored balance no longer equals Σ entries. Should always be
 * empty — a non-empty result means a balance was edited outside the ledger and
 * needs a recompute (reconcileWalletBalance).
 */
export async function findDriftedWallets(
  limit = 100,
): Promise<DriftedWallet[]> {
  const [wallets, sums] = await Promise.all([
    prisma.wallet.findMany({
      select: {
        id: true,
        userId: true,
        availableUsd: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.walletEntry.groupBy({
      by: ["walletId"],
      _sum: { amountUsd: true },
    }),
  ]);
  const computedByWallet = new Map(
    sums.map((s) => [s.walletId, round2(Number(s._sum.amountUsd ?? 0))]),
  );

  const drifted: DriftedWallet[] = [];
  for (const w of wallets) {
    const stored = round2(Number(w.availableUsd));
    const computed = computedByWallet.get(w.id) ?? 0;
    if (Math.abs(stored - computed) > EPSILON) {
      drifted.push({
        userId: w.userId,
        name: w.user.name ?? w.user.email ?? "—",
        stored,
        computed,
        diff: round2(stored - computed),
      });
    }
  }
  return drifted
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, limit);
}
