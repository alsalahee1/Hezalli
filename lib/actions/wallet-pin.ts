"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getWalletId } from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

const PIN_RE = /^\d{4,6}$/;

// Set or change the wallet PIN. A 4–6 digit numeric PIN. Changing an existing
// PIN requires the current one. Resets any lockout on success.
export async function setWalletPin(input: {
  pin: string;
  currentPin?: string;
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

  // Changing an existing PIN requires proving the current one.
  if (wallet.pinHash) {
    const current = String(input.currentPin ?? "").trim();
    if (!current || !(await verifyPassword(current, wallet.pinHash))) {
      return { error: "wrongCurrentPin" };
    }
  }

  const pinHash = await hashPassword(pin);
  await prisma.wallet.update({
    where: { id: walletId },
    data: { pinHash, pinFailedCount: 0, pinLockedUntil: null },
  });

  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}
