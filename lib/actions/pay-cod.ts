"use server";

// Doorstep digital payment for COD orders (docs §39): the buyer settles a
// cash-on-delivery order from their HezalliPay balance BEFORE handover, so
// the driver (or pickup counter) collects nothing — the endgame of COD risk
// control (Amazon "COD by UPI", Shopee/Lazada wallet-at-door).
//
// The order keeps method COD; what flips is the Payment row → CONFIRMED.
// Every downstream money path already keys off that: markSubOrderDelivered
// and the point pickup counter charge cash only while the payment is
// unconfirmed, so a paid order delivers exactly like a prepaid one.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

type Result = { ok?: boolean; error?: string };

class PayError extends Error {}

// Sub-orders in these states haven't exchanged any money yet, so the full
// grand total is still what the buyer owes. Anything already DELIVERED
// (cash possibly collected), CANCELLED, or in a return path makes the
// remaining amount ambiguous — those orders settle in cash as usual.
const PAYABLE_SUB_STATES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"];

export async function payCodWithWallet(orderId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "forbidden" };
  const buyerId = session.user.id;

  // Admin kill switch (Admin → Settings). Same gate pattern as wallet bills.
  if (!(await getSetting("cod_wallet_pay_enabled"))) {
    return { error: "disabled" };
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      grandTotal: true,
      payment: { select: { id: true, status: true } },
      subOrders: {
        select: {
          status: true,
          shipment: { select: { driverId: true, status: true } },
        },
      },
    },
  });
  if (!order || !order.payment) return { error: "notFound" };
  if (order.paymentMethod !== "COD") return { error: "badState" };
  if (order.payment.status === "CONFIRMED") return { error: "alreadyPaid" };
  if (!order.subOrders.every((s) => PAYABLE_SUB_STATES.includes(s.status))) {
    return { error: "badState" };
  }

  const amount = Math.round(Number(order.grandTotal) * 100) / 100;
  if (!(amount > 0)) return { error: "badState" };

  const walletId = await getWalletId(buyerId);
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { availableUsd: true, frozen: true, codHoldUsd: true },
  });
  if (wallet.frozen) return { error: "frozen" };
  // A COD collateral hold (docs §36) is not spendable.
  const hold = Number(wallet.codHoldUsd);
  if (amount > Number(wallet.availableUsd) - hold) {
    return { error: "insufficient" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Atomic debit — the conditional decrement is the authoritative
      // balance check (same pattern as checkout with HEZALLI_BALANCE).
      const upd = await tx.wallet.updateMany({
        where: {
          id: walletId,
          frozen: false,
          availableUsd: { gte: Math.round((amount + hold) * 100) / 100 },
        },
        data: { availableUsd: { decrement: amount } },
      });
      if (upd.count !== 1) throw new PayError("insufficient");

      // Conditional flip guards a double-pay racing a doorstep delivery.
      const paid = await tx.payment.updateMany({
        where: { id: order.payment!.id, status: { not: "CONFIRMED" } },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedBy: "buyer:wallet",
          reference: "Paid from HezalliPay wallet",
        },
      });
      if (paid.count !== 1) throw new PayError("alreadyPaid");

      await creditWalletTx(tx, walletId, {
        type: "PAYMENT",
        amountUsd: -amount,
        orderId: order.id,
        note: "COD order paid from wallet",
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status,
          actor: "buyer",
          note: "COD settled from HezalliPay wallet — no cash due at delivery",
        },
      });

      // Tell every assigned driver still on the road: collect nothing.
      const driverIds = [
        ...new Set(
          order.subOrders
            .filter(
              (s) => s.shipment?.driverId && s.shipment.status !== "DELIVERED",
            )
            .map((s) => s.shipment!.driverId!),
        ),
      ];
      for (const driverId of driverIds) {
        await tx.notification.create({
          data: {
            userId: driverId,
            type: "PAYMENT",
            title: "Order paid digitally",
            body: "The buyer paid this COD order from their wallet — collect NO cash at the door.",
            data: { link: "/driver" },
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof PayError) return { error: e.message };
    throw e;
  }

  await recomputeWalletBalance(buyerId);

  const locale = await getLocale();
  revalidatePath(`/${locale}/account/orders/${orderId}`);
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}
