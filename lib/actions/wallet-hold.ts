"use server";

// Wallet COD hold (docs §36): a courier pledges part of their HezalliPay
// balance as collateral for the COD cash they carry. The pledge is
// self-service: raising it just locks more of their own money (needs the
// balance to cover it); releasing it is only allowed while the driver holds
// no COD cash — otherwise the collateral could vanish exactly when it
// matters. The hold never moves money: outflow guards keep
// availableUsd ≥ codHoldUsd, and cod-guard counts min(hold, balance).
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireCourierId } from "@/lib/authz";
import { courierCashSummary } from "@/lib/courier-ledger";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getWalletId } from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

export async function setWalletCodHold(formData: FormData): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };

  // Throttle: pledges change occasionally, not in bursts.
  if (!rateLimit(`codhold:${courierId}`, 10, 60_000).ok) {
    return { error: "tooMany" };
  }

  const amount = Math.round(Number(formData.get("amount")) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) return { error: "badInput" };

  const walletId = await getWalletId(courierId);
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { codHoldUsd: true, frozen: true },
  });
  if (wallet.frozen) return { error: "frozen" };
  const previous = Number(wallet.codHoldUsd);
  if (amount === previous) return { ok: true };

  if (amount < previous) {
    // Releasing collateral: only with empty pockets — hand COD in first.
    const cash = await courierCashSummary(courierId);
    if (cash.cashOnHand > 0.005) return { error: "cashHeld" };
    await prisma.wallet.update({
      where: { id: walletId },
      data: { codHoldUsd: amount },
    });
  } else {
    // Raising collateral: the balance must actually cover the new hold, and
    // the conditional update makes the check atomic against parallel spends.
    const upd = await prisma.wallet.updateMany({
      where: { id: walletId, frozen: false, availableUsd: { gte: amount } },
      data: { codHoldUsd: amount },
    });
    if (upd.count !== 1) return { error: "insufficient" };
  }

  await prisma.auditLog.create({
    data: {
      actorId: courierId,
      action: "courier.walletHold",
      entity: "Wallet",
      entityId: walletId,
      meta: { previous, amount },
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/driver`);
  revalidatePath(`/${locale}/driver/ledger`);
  return { ok: true };
}
