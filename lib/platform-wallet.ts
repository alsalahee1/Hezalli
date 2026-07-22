// Resolves "the Hezalli wallet" — the platform account that receives digital
// COD settlements from couriers (lib/actions/cod-wallet-remit.ts). The account
// is configured by email in platform settings (platform_wallet_email) and must
// be an active ADMIN, so a mistyped or demoted account can never silently
// become the money sink. NOT a server action — callers pass no client input.
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

/**
 * The user id whose wallet is Hezalli's platform wallet, or null if the
 * configured account is missing, suspended, deleted, or not an ADMIN.
 */
export async function getPlatformWalletUserId(): Promise<string | null> {
  const email = (await getSetting("platform_wallet_email"))
    .trim()
    .toLowerCase();
  if (!email) return null;
  const user = await prisma.user.findFirst({
    where: {
      email,
      isSuspended: false,
      deletedAt: null,
      roles: { has: "ADMIN" },
    },
    select: { id: true },
  });
  return user?.id ?? null;
}
