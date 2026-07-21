"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { localizedName } from "@/lib/categories";
import { getFlashPricesFor } from "@/lib/flash";
import { effectivePrice } from "@/lib/pricing";
import { getCommissionRate, recomputeBalance, round2 } from "@/lib/finance";
import { capRedemption } from "@/lib/loyalty";
import { aggregateOrderStatus } from "@/lib/order-status";
import { checkPointRoutable } from "@/lib/point-select";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import {
  quoteShippingForStores,
  resolveShippingChoice,
  type ShippingMethod,
} from "@/lib/shipping";
import { validateCoupon } from "@/lib/vouchers";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

export type PaymentMethodChoice =
  "COD" | "LOCAL_WALLET" | "BANK_TRANSFER" | "USDT" | "HEZALLI_BALANCE";
export type PlaceOrderInput = {
  addressId: string;
  items: { variantId: string; quantity: number }[];
  paymentMethod: PaymentMethodChoice;
  couponCode?: string;
  redeemPoints?: number;
  // Buyer's chosen delivery tier per store (storeId → method). Absent stores
  // default to STANDARD. The server re-quotes the fee — the client choice only
  // selects which option applies.
  shippingMethods?: Record<string, ShippingMethod>;
  // The ONE Hezalli Point the buyer collects from, required when any store
  // group chose PICKUP (docs/DELIVERY-POINTS.md §6).
  pickupPointId?: string;
};
export type PlaceOrderResult = { orderId?: string; error?: string };

class StockError extends Error {}
class PointsError extends Error {}
class CouponError extends Error {}
class FlashError extends Error {}
class WalletError extends Error {}

export async function placeOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const items = input.items.filter((i) => i.quantity > 0);
  if (items.length === 0) return { error: "emptyOrder" };

  // Manual prepaid methods (bank / USDT / local wallet) start unpaid: the order
  // waits at PENDING until the buyer submits proof and an admin confirms it.
  // HEZALLI_BALANCE and COD are confirmed immediately — the wallet is debited in
  // the order transaction, and COD cash is collected on delivery.
  const wallet = input.paymentMethod === "HEZALLI_BALANCE";
  const manualPrepaid = input.paymentMethod !== "COD" && !wallet;
  // Order + payment are confirmed at placement for COD and wallet payments.
  const confirmedNow = !manualPrepaid;

  // Cash-on-delivery can be switched off platform-wide (admin settings).
  if (input.paymentMethod === "COD" && !(await getSetting("cod_enabled"))) {
    return { error: "codDisabled" };
  }

  const address = await prisma.address.findFirst({
    where: { id: input.addressId, userId },
    select: { id: true, governorate: true },
  });
  if (!address) return { error: "addressRequired" };

  const variantIds = [...new Set(items.map((i) => i.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      sku: true,
      price: true,
      compareAtPrice: true,
      saleStartsAt: true,
      saleEndsAt: true,
      stock: true,
      isActive: true,
      product: {
        select: { id: true, storeId: true, status: true, title: true },
      },
    },
  });
  const vById = new Map(variants.map((v) => [v.id, v]));

  // Live flash pricing (optimistic; the atomic stock guard runs in the tx).
  const flashMap = await getFlashPricesFor(variantIds);

  // Re-validate availability + build per-seller groups with price snapshots.
  type Line = {
    variantId: string;
    sku: string;
    title: string;
    price: number;
    qty: number;
  };
  const byStore = new Map<string, Line[]>();
  for (const it of items) {
    const v = vById.get(it.variantId);
    if (!v || !v.isActive || v.product.status !== "ACTIVE") {
      return { error: "unavailable" };
    }
    if (v.stock < it.quantity) return { error: "outOfStock" };
    const line: Line = {
      variantId: v.id,
      sku: v.sku,
      title: localizedName(v.product.title, locale),
      // Flash price wins; otherwise the scheduled (or normal) price applies.
      price: flashMap.get(v.id)?.salePrice ?? effectivePrice(v).price,
      qty: it.quantity,
    };
    const arr = byStore.get(v.product.storeId) ?? [];
    arr.push(line);
    byStore.set(v.product.storeId, arr);
  }

  const rawGroups = [...byStore.entries()].map(([storeId, lines]) => ({
    storeId,
    lines,
    // Round each line before summing so the store total always equals the sum of
    // the stored per-line totals (no sub-cent drift into commission/refund math).
    itemsTotal: round2(lines.reduce((s, l) => s + round2(l.price * l.qty), 0)),
  }));
  // Authoritative shipping: zone-based rate for the destination governorate,
  // for the buyer's chosen tier (standard/express) per store. The fee is always
  // re-derived here — the client choice only selects which option applies.
  const shipQuote = await quoteShippingForStores(
    address.governorate,
    rawGroups.map((g) => ({ storeId: g.storeId, subtotal: g.itemsTotal })),
  );
  const wantMethods = input.shippingMethods ?? {};
  const groupsBase = rawGroups.map((g) => {
    const want = wantMethods[g.storeId];
    const choice = resolveShippingChoice(
      shipQuote.get(g.storeId),
      want === "EXPRESS"
        ? "EXPRESS"
        : want === "PICKUP"
          ? "PICKUP"
          : "STANDARD",
    );
    return { ...g, shipping: choice.fee, shippingMethod: choice.method };
  });

  // Any group collected from a point needs the buyer's chosen point — one per
  // order, validated ACTIVE server-side.
  let pickupPointId: string | null = null;
  if (groupsBase.some((g) => g.shippingMethod === "PICKUP")) {
    const wanted = input.pickupPointId?.trim();
    if (!wanted) return { error: "pickupPointRequired" };
    const routable = await checkPointRoutable(wanted);
    if (routable === "full") return { error: "pointFull" };
    if (routable !== "ok") return { error: "pickupPointRequired" };
    pickupPointId = wanted;
  }

  // Optional voucher: validate + compute per-store discount.
  let couponId: string | null = null;
  let couponMaxUses: number | null = null;
  let couponPerUserLimit: number | null = null;
  const discountByStore = new Map<string, number>();
  const code = input.couponCode?.trim();
  if (code) {
    const res = await validateCoupon(
      code,
      userId,
      groupsBase.map((g) => ({
        storeId: g.storeId,
        itemsTotal: g.itemsTotal,
        shipping: g.shipping,
      })),
    );
    if (!res.ok) return { error: `coupon_${res.error}` };
    couponId = res.coupon.id;
    couponMaxUses = res.coupon.maxUses;
    couponPerUserLimit = res.coupon.perUserLimit;
    for (const [sid, d] of Object.entries(res.discount.perStore)) {
      discountByStore.set(sid, d);
    }
  }

  // Loyalty redemption: a platform-funded discount, mutually exclusive with a
  // coupon (keeps each order's discount single-source so settlement/refund math
  // stays correct — a no-coupon discount is treated as platform-funded).
  let pointsRedeemed = 0;
  const wantRedeem = Math.floor(input.redeemPoints ?? 0);
  if (wantRedeem > 0) {
    if (couponId) return { error: "pointsAndCoupon" };
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { loyaltyPoints: true },
    });
    const itemsSubtotal = groupsBase.reduce((s, g) => s + g.itemsTotal, 0);
    const { pointsUsed, discountUsd } = capRedemption(
      wantRedeem,
      u?.loyaltyPoints ?? 0,
      itemsSubtotal,
    );
    if (discountUsd > 0 && itemsSubtotal > 0) {
      pointsRedeemed = pointsUsed;
      let allocated = 0;
      groupsBase.forEach((g, i) => {
        const share =
          i === groupsBase.length - 1
            ? round2(discountUsd - allocated)
            : round2((discountUsd * g.itemsTotal) / itemsSubtotal);
        if (i < groupsBase.length - 1) allocated = round2(allocated + share);
        discountByStore.set(g.storeId, Math.max(0, share));
      });
    }
  }

  const groups = groupsBase.map((g) => ({
    ...g,
    discount: discountByStore.get(g.storeId) ?? 0,
  }));
  const itemsTotal = groups.reduce((s, g) => s + g.itemsTotal, 0);
  const shippingTotal = groups.reduce((s, g) => s + g.shipping, 0);
  const discountTotal = round2(groups.reduce((s, g) => s + g.discount, 0));
  const grandTotal = round2(itemsTotal + shippingTotal - discountTotal);
  const platformRate = await getCommissionRate();

  // Seller users (for notifications) + per-seller commission override, by store.
  const stores = await prisma.store.findMany({
    where: { id: { in: groups.map((g) => g.storeId) } },
    select: {
      id: true,
      seller: {
        select: {
          id: true,
          commissionRate: true,
          user: { select: { id: true, locale: true } },
        },
      },
    },
  });
  const sellerByStore = new Map(stores.map((s) => [s.id, s.seller.user]));
  // Seller-profile id per store, for the post-payment escrow recompute below.
  const sellerProfileByStore = new Map(stores.map((s) => [s.id, s.seller.id]));
  // A seller may carry a negotiated rate; otherwise the platform-wide rate.
  const rateByStore = new Map(
    stores.map((s) => [
      s.id,
      s.seller.commissionRate != null
        ? Number(s.seller.commissionRate)
        : platformRate,
    ]),
  );

  // HezalliPay: ensure the buyer's wallet row exists so we can debit it
  // atomically inside the order transaction.
  const walletId = wallet ? await getWalletId(userId) : null;

  try {
    const orderId = await prisma.$transaction(async (tx) => {
      // Atomic stock decrement — guards against overselling.
      for (const it of items) {
        const upd = await tx.productVariant.updateMany({
          where: { id: it.variantId, stock: { gte: it.quantity } },
          data: { stock: { decrement: it.quantity } },
        });
        if (upd.count !== 1) throw new StockError(it.variantId);
      }

      // Atomically claim flash stock for flash-priced lines; if a concurrent
      // order took the last units, abort so the buyer retries at normal price.
      for (const it of items) {
        const flash = flashMap.get(it.variantId);
        if (!flash) continue;
        const guard =
          flash.stockLimit != null
            ? { soldCount: { lte: flash.stockLimit - it.quantity } }
            : {};
        const upd = await tx.flashSaleItem.updateMany({
          where: { id: flash.itemId, ...guard },
          data: { soldCount: { increment: it.quantity } },
        });
        if (upd.count !== 1) throw new FlashError();
      }

      // HezalliPay: atomically debit the wallet, guarding against overspend and
      // concurrent double-spend (same pattern as the stock/points guards). The
      // conditional decrement is the authoritative balance check.
      if (walletId) {
        const upd = await tx.wallet.updateMany({
          where: {
            id: walletId,
            frozen: false,
            availableUsd: { gte: grandTotal },
          },
          data: { availableUsd: { decrement: grandTotal } },
        });
        if (upd.count !== 1) throw new WalletError();
      }

      const orderStatus = confirmedNow ? "CONFIRMED" : "PENDING";
      const order = await tx.order.create({
        data: {
          buyer: { connect: { id: userId } },
          address: { connect: { id: input.addressId } },
          status: orderStatus,
          paymentMethod: input.paymentMethod,
          itemsTotal,
          shippingTotal,
          discountTotal,
          grandTotal,
          ...(couponId ? { coupon: { connect: { id: couponId } } } : {}),
          displayCurrency: "USD",
          exchangeRate: 1,
          displayTotal: grandTotal,
          subOrders: {
            create: groups.map((g) => ({
              store: { connect: { id: g.storeId } },
              status: orderStatus,
              shippingMethod: g.shippingMethod,
              pickupPointId:
                g.shippingMethod === "PICKUP" ? pickupPointId : null,
              itemsTotal: g.itemsTotal,
              shippingTotal: g.shipping,
              discountTotal: g.discount,
              commissionRate: rateByStore.get(g.storeId) ?? platformRate,
              commissionAmt: 0,
              sellerNet: 0,
              items: {
                create: g.lines.map((l) => ({
                  variantId: l.variantId,
                  titleSnapshot: l.title,
                  skuSnapshot: l.sku,
                  unitPrice: l.price,
                  quantity: l.qty,
                  lineTotal: round2(l.price * l.qty),
                })),
              },
            })),
          },
          payment: {
            create: {
              method: input.paymentMethod,
              // Wallet payments are settled instantly; other methods stay
              // PENDING until confirmed (COD on delivery, manual on proof).
              status: wallet ? "CONFIRMED" : "PENDING",
              amountUsd: grandTotal,
              confirmedAt: wallet ? new Date() : null,
              confirmedBy: wallet ? "system:wallet" : null,
            },
          },
          history: {
            create: [
              {
                status: orderStatus,
                actor: "buyer",
                note: wallet
                  ? "Order placed (paid from HezalliPay wallet)"
                  : manualPrepaid
                    ? "Order placed (awaiting payment)"
                    : "Order placed (COD)",
              },
            ],
          },
        },
        select: { id: true },
      });

      // HezalliPay: record the immutable wallet debit for this order. The
      // balance was already decremented above; this keeps balance = Σ entries.
      if (walletId) {
        await creditWalletTx(tx, walletId, {
          type: "PAYMENT",
          amountUsd: -grandTotal,
          orderId: order.id,
          note: "Order payment from wallet",
        });
      }

      // Redeem the voucher atomically. The conditional increment guards the
      // global usage limit AND takes an exclusive lock on the coupon row, so any
      // concurrent checkout using the same coupon serializes behind it — which is
      // what lets the per-user-limit count below be trusted (a parallel checkout's
      // redemption is already committed by the time we read it).
      if (couponId) {
        const guard =
          couponMaxUses != null ? { usedCount: { lt: couponMaxUses } } : {};
        const upd = await tx.coupon.updateMany({
          where: { id: couponId, isActive: true, ...guard },
          data: { usedCount: { increment: 1 } },
        });
        if (upd.count !== 1) throw new CouponError();
        if (couponPerUserLimit != null) {
          const usedByUser = await tx.couponRedemption.count({
            where: { couponId, userId },
          });
          if (usedByUser >= couponPerUserLimit) throw new CouponError();
        }
        await tx.couponRedemption.create({
          data: { couponId, userId, orderId: order.id },
        });
      }

      // Redeem loyalty points atomically (guards against concurrent double-spend).
      if (pointsRedeemed > 0) {
        const upd = await tx.user.updateMany({
          where: { id: userId, loyaltyPoints: { gte: pointsRedeemed } },
          data: { loyaltyPoints: { decrement: pointsRedeemed } },
        });
        if (upd.count !== 1) throw new PointsError();
        await tx.loyaltyTransaction.create({
          data: {
            userId,
            points: -pointsRedeemed,
            type: "REDEEM",
            orderId: order.id,
            note: "Checkout redemption",
          },
        });
      }

      // Confirmed-at-placement orders (COD, wallet) notify sellers immediately;
      // manual-prepaid orders notify sellers only once payment is confirmed
      // (see confirmPayment).
      if (confirmedNow) {
        for (const g of groups) {
          const seller = sellerByStore.get(g.storeId);
          if (!seller) continue;
          const ar = seller.locale === "ar";
          await tx.notification.create({
            data: {
              userId: seller.id,
              type: "ORDER",
              title: ar ? "طلب جديد" : "New order",
              body: ar
                ? `لديك طلب جديد بقيمة ${g.itemsTotal.toFixed(2)}$.`
                : `You have a new order worth $${g.itemsTotal.toFixed(2)}.`,
              data: { orderId: order.id, link: "/seller/orders" },
            },
          });
        }
      }
      const ar = locale === "ar";
      const amt = grandTotal.toFixed(2);
      const buyerNote = wallet
        ? {
            title: ar ? "تم الدفع من محفظتك" : "Paid from your wallet",
            body: ar
              ? `تم تأكيد طلبك بقيمة ${amt}$ (مدفوع من محفظة HezalliPay).`
              : `Your $${amt} order is confirmed (paid from your HezalliPay balance).`,
          }
        : manualPrepaid
          ? {
              title: ar ? "طلبك بانتظار الدفع" : "Complete your payment",
              body: ar
                ? `أكمل دفع ${amt}$ وأرسل إثبات الدفع.`
                : `Complete your $${amt} payment and submit proof.`,
            }
          : {
              title: ar ? "تم استلام طلبك" : "Order placed",
              body: ar
                ? `تم تأكيد طلبك بقيمة ${amt}$ (الدفع عند الاستلام).`
                : `Your order for $${amt} is confirmed (cash on delivery).`,
            };
      await tx.notification.create({
        data: {
          userId,
          type: manualPrepaid || wallet ? "PAYMENT" : "ORDER",
          title: buyerNote.title,
          body: buyerNote.body,
          data: { orderId: order.id, link: `/account/orders/${order.id}` },
        },
      });

      // Clear the purchased items from the cart.
      await tx.cartItem.deleteMany({
        where: { cart: { userId }, variantId: { in: variantIds } },
      });

      return order.id;
    });

    // Wallet payments are settled instantly: recompute the buyer's wallet
    // balance and each seller's escrow (their SALE credit is now held pending),
    // mirroring confirmPayment for a manual prepaid order.
    if (wallet) {
      await recomputeWalletBalance(userId);
      const sellerProfileIds = [
        ...new Set(
          groups
            .map((g) => sellerProfileByStore.get(g.storeId))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      for (const pid of sellerProfileIds) await recomputeBalance(pid);
    }

    revalidatePath(`/${locale}/account/orders`);
    revalidatePath(`/${locale}/seller/orders`);
    return { orderId };
  } catch (e) {
    if (e instanceof StockError) return { error: "outOfStock" };
    if (e instanceof CouponError) return { error: "coupon_usedUp" };
    if (e instanceof FlashError) return { error: "flashUnavailable" };
    if (e instanceof PointsError) return { error: "pointsInsufficient" };
    if (e instanceof WalletError) return { error: "insufficientBalance" };
    throw e;
  }
}

// Sub-order statuses a buyer can still cancel: stock is restored and they flip to
// CANCELLED — never one already shipped/delivered, refunded, or cancelled.
const CANCELLABLE_SUB = ["PENDING", "CONFIRMED", "PROCESSING"] as const;

export async function cancelOrder(
  orderId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: session.user.id },
    select: {
      id: true,
      status: true,
      buyerId: true,
      paymentMethod: true,
      couponId: true,
      payment: { select: { id: true, status: true } },
      subOrders: {
        select: {
          id: true,
          status: true,
          itemsTotal: true,
          shippingTotal: true,
          discountTotal: true,
          store: {
            select: {
              seller: {
                select: {
                  id: true,
                  user: { select: { id: true, locale: true } },
                },
              },
            },
          },
          items: { select: { variantId: true, quantity: true } },
        },
      },
    },
  });
  if (!order) return { error: "notFound" };

  // Only the still-cancellable sub-orders can be cancelled — never one already
  // shipped/delivered (in transit to the buyer), refunded, or cancelled. A whole
  // order with nothing cancellable is too late.
  const cancellable = order.subOrders.filter((s) =>
    (CANCELLABLE_SUB as readonly string[]).includes(s.status),
  );
  if (cancellable.length === 0) return { error: "tooLate" };
  // A "full" cancel (every sub-order was still active) is what restores the
  // order-level coupon usage and redeemed points; a partial cancel leaves those
  // for the sub-orders that still stand.
  const wasFullyActive = order.subOrders.every((s) =>
    (CANCELLABLE_SUB as readonly string[]).includes(s.status),
  );
  const paidAmountOf = (s: (typeof cancellable)[number]) =>
    round2(
      Number(s.itemsTotal) + Number(s.shippingTotal) - Number(s.discountTotal),
    );

  // A wallet-paid order is CONFIRMED (and thus cancellable) with the money
  // already taken in-system — cancelling must return it to the wallet.
  const refundWallet =
    order.paymentMethod === "HEZALLI_BALANCE" &&
    order.payment?.status === "CONFIRMED";
  const walletId = refundWallet ? await getWalletId(order.buyerId) : null;

  const cancelledSubIds: string[] = [];
  let refundAmount = 0;
  await prisma.$transaction(async (tx) => {
    // Cancel each still-cancellable sub-order under its own conditional guard, so
    // concurrent cancels can't flip (or refund) the same sub-order twice and the
    // refund only ever covers what THIS call actually cancelled.
    for (const sub of cancellable) {
      const upd = await tx.subOrder.updateMany({
        where: { id: sub.id, status: { in: [...CANCELLABLE_SUB] } },
        data: { status: "CANCELLED" },
      });
      if (upd.count !== 1) continue; // cancelled/advanced concurrently
      cancelledSubIds.push(sub.id);
      refundAmount = round2(refundAmount + paidAmountOf(sub));
      for (const it of sub.items) {
        await tx.productVariant.updateMany({
          where: { id: it.variantId },
          data: { stock: { increment: it.quantity } },
        });
      }
    }
    if (cancelledSubIds.length === 0) return; // lost every sub to a race

    // Recompute the order status from all sub-orders — a partial cancel leaves
    // the order at the aggregate of the sub-orders that still stand rather than
    // forcing the whole order to CANCELLED.
    const remaining = await tx.subOrder.findMany({
      where: { orderId: order.id },
      select: { status: true },
    });
    const allTerminal = remaining.every(
      (s) => s.status === "CANCELLED" || s.status === "REFUNDED",
    );
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: allTerminal
          ? "CANCELLED"
          : (aggregateOrderStatus(remaining.map((s) => s.status)) as never),
      },
    });

    // Return the wallet-paid funds for exactly the cancelled portion.
    if (walletId && refundAmount > 0) {
      await creditWalletTx(tx, walletId, {
        type: "REFUND",
        amountUsd: refundAmount,
        orderId: order.id,
        note: "Order cancelled — refunded to wallet",
      });
      // Only mark the payment REFUNDED once the whole order is terminal.
      if (allTerminal && order.payment) {
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status: "REFUNDED" },
        });
      }
    }

    // Coupon + redeemed points are order-level, so they are reversed only on a
    // full cancel (every sub-order cancelled).
    const fullCancel = wasFullyActive && allTerminal;
    if (fullCancel && order.couponId) {
      await tx.coupon.updateMany({
        where: { id: order.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
      await tx.couponRedemption.deleteMany({
        where: { couponId: order.couponId, orderId: order.id },
      });
    }
    if (fullCancel) {
      const redeem = await tx.loyaltyTransaction.findFirst({
        where: { orderId: order.id, type: "REDEEM" },
        select: { points: true },
      });
      if (redeem && redeem.points < 0) {
        const restore = -redeem.points;
        await tx.loyaltyTransaction.create({
          data: {
            userId: order.buyerId,
            points: restore,
            type: "REFUND",
            orderId: order.id,
            note: "Points restored on cancel",
          },
        });
        await tx.user.update({
          where: { id: order.buyerId },
          data: { loyaltyPoints: { increment: restore } },
        });
      }
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: "CANCELLED",
        actor: "buyer",
        note: walletId
          ? "Cancelled by buyer — refunded to wallet"
          : "Cancelled by buyer",
      },
    });
    // Notify only the sellers whose sub-orders were actually cancelled.
    const notified = new Set<string>();
    for (const sub of cancellable) {
      if (!cancelledSubIds.includes(sub.id)) continue;
      const seller = sub.store.seller.user;
      if (notified.has(seller.id)) continue;
      notified.add(seller.id);
      const ar = seller.locale === "ar";
      await tx.notification.create({
        data: {
          userId: seller.id,
          type: "ORDER",
          title: ar ? "أُلغي طلب" : "Order cancelled",
          body: ar
            ? "ألغى المشتري طلباً كان موجهاً لمتجرك."
            : "A buyer cancelled an order for your store.",
          data: { orderId: order.id },
        },
      });
    }
  });

  // Lost the race to a concurrent cancel / status advance — nothing was written.
  if (cancelledSubIds.length === 0) return { error: "tooLate" };

  // Wallet refund settled instantly: recompute the buyer's balance and drop the
  // now-cancelled sub-orders from each affected seller's escrow.
  if (walletId && refundAmount > 0) {
    await recomputeWalletBalance(order.buyerId);
    const sellerProfileIds = [
      ...new Set(
        cancellable
          .filter((s) => cancelledSubIds.includes(s.id))
          .map((s) => s.store.seller.id),
      ),
    ];
    for (const pid of sellerProfileIds) await recomputeBalance(pid);
    await prisma.notification.create({
      data: {
        userId: order.buyerId,
        type: "PAYMENT",
        title:
          locale === "ar" ? "تم رد المبلغ إلى محفظتك" : "Refunded to wallet",
        body:
          locale === "ar"
            ? `تمت إعادة ${refundAmount.toFixed(2)}$ إلى محفظتك.`
            : `$${refundAmount.toFixed(2)} was returned to your wallet.`,
        data: { orderId: order.id, link: `/account/orders/${order.id}` },
      },
    });
  }

  revalidatePath(`/${locale}/account/orders`);
  revalidatePath(`/${locale}/account/orders/${orderId}`);
  revalidatePath(`/${locale}/seller/orders`);
  return { ok: true };
}
