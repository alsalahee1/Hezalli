// Wallet top-up limits (Step 19.3). A pragmatic, KYC-tiered control until the
// full buyer-KYC / e-money work lands (see docs/19-wallet-strategy.md §4):
// unverified users hold up to the configured balance cap; users with a VERIFIED
// seller profile get a multiple of it. Per-transaction bounds apply to all.
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";

// VERIFIED users may hold this multiple of the standard balance cap.
const VERIFIED_CAP_MULTIPLIER = 5;

export type WalletLimits = {
  min: number;
  max: number; // per-transaction
  cap: number; // maximum standing balance (available + pending top-ups)
  verified: boolean;
};

export async function getWalletLimits(userId: string): Promise<WalletLimits> {
  const [settings, profile] = await Promise.all([
    getPlatformSettings(),
    prisma.sellerProfile.findUnique({
      where: { userId },
      select: { kycStatus: true },
    }),
  ]);
  const verified = profile?.kycStatus === "VERIFIED";
  return {
    min: settings.wallet_topup_min_usd,
    max: settings.wallet_topup_max_usd,
    cap:
      settings.wallet_balance_cap_usd *
      (verified ? VERIFIED_CAP_MULTIPLIER : 1),
    verified,
  };
}
