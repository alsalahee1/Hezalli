"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getWalletId } from "@/lib/wallet";
import { verifyWalletAuth } from "@/lib/wallet-step-auth";

type Result = { ok?: boolean; error?: string };

const PIN_RE = /^\d{4,6}$/;

// Set or change the wallet PIN. A 4–6 digit numeric PIN. Resets any lockout on
// success.
//
// SECURITY: setting/replacing the PIN is itself a money-authorizing operation —
// once set, the PIN authorizes every wallet outflow. So whenever the wallet
// already has ANY step-up factor (an existing PIN or a registered passkey), a
// change requires proving that factor first. Otherwise a hijacked session could
// enrol a fresh PIN on a passkey-only wallet and bypass the passkey entirely.
export async function setWalletPin(input: {
  pin: string;
  currentPin?: string;
  passkey?: string;
}): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const pin = String(input.pin ?? "").trim();
  if (!PIN_RE.test(pin)) return { error: "badPin" };

  const walletId = await getWalletId(userId);
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { pinHash: true },
  });
  const hasPasskey =
    (await prisma.walletCredential.count({ where: { userId } })) > 0;

  // Step-up required when a factor already exists: the current PIN, or (for a
  // passkey-protected wallet setting its first PIN) a passkey assertion.
  if (wallet.pinHash || hasPasskey) {
    const res = await verifyWalletAuth(userId, {
      pin: input.currentPin,
      passkey: input.passkey,
    });
    if (!res.ok) return { error: "wrongCurrentPin" };
  }

  const pinHash = await hashPassword(pin);
  await prisma.wallet.update({
    where: { id: walletId },
    data: { pinHash, pinFailedCount: 0, pinLockedUntil: null },
  });

  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}
