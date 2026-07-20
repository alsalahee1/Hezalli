// Wallet PIN verification + brute-force lockout (Step 19.9). NOT a server action
// — callers pass the *authenticated* user id, so the PIN can never be checked
// against an arbitrary account from the client. Every wallet outflow (send, pay,
// bill, cash-out) verifies the PIN through `verifyWalletPin` before moving money.
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

// After this many consecutive wrong PINs, attempts are blocked for the cool-off.
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type PinResult = {
  ok?: boolean;
  error?: "noPin" | "locked" | "wrongPin";
};

/** True if the user has set a wallet PIN. */
export async function walletHasPin(userId: string): Promise<boolean> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { pinHash: true },
  });
  return !!wallet?.pinHash;
}

/**
 * Verify a PIN for the given user. On success resets the failure counter; on
 * failure increments it and, past the threshold, sets a lockout window. Returns
 * a typed error (never throws for expected cases).
 */
export async function verifyWalletPin(
  userId: string,
  pin: string,
): Promise<PinResult> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: {
      id: true,
      pinHash: true,
      pinFailedCount: true,
      pinLockedUntil: true,
    },
  });
  if (!wallet?.pinHash) return { error: "noPin" };

  const now = new Date();
  if (wallet.pinLockedUntil && wallet.pinLockedUntil > now) {
    return { error: "locked" };
  }

  const ok = await verifyPassword(String(pin ?? ""), wallet.pinHash);
  if (ok) {
    if (wallet.pinFailedCount !== 0 || wallet.pinLockedUntil) {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { pinFailedCount: 0, pinLockedUntil: null },
      });
    }
    return { ok: true };
  }

  const failed = wallet.pinFailedCount + 1;
  const lock = failed >= MAX_ATTEMPTS;
  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      pinFailedCount: lock ? 0 : failed,
      pinLockedUntil: lock
        ? new Date(now.getTime() + LOCK_MINUTES * 60_000)
        : wallet.pinLockedUntil,
    },
  });
  return { error: lock ? "locked" : "wrongPin" };
}
