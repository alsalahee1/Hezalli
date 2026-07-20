// Loyalty points + referrals (Step 17.9). Buyers earn points on completed
// purchases and can redeem them as a platform-funded discount at checkout;
// referring a new buyer earns a bonus once the referee's first order settles.
import { randomBytes } from "node:crypto";

import { isUniqueViolation } from "@/lib/db-errors";
import {
  POINTS_PER_USD_EARNED,
  REFERRAL_BONUS_POINTS,
} from "@/lib/loyalty-shared";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

// Re-export the pure math so server callers can keep importing from "@/lib/loyalty".
export * from "@/lib/loyalty-shared";

export function generateReferralCode(): string {
  return `HZ${randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * Award purchase points for a settled sub-order (idempotent per sub-order), and
 * — on the buyer's very first earning — pay the referral bonus to whoever
 * referred them. Called from settleSubOrder, which itself only runs once.
 */
export async function awardPurchasePoints(
  buyerId: string,
  orderId: string,
  subOrderId: string,
  itemsTotal: number,
): Promise<void> {
  const dupe = await prisma.loyaltyTransaction.findFirst({
    where: { subOrderId, type: "EARN" },
    select: { id: true },
  });
  if (dupe) return;

  const points = Math.floor(itemsTotal * POINTS_PER_USD_EARNED);

  // Is this the buyer's first-ever earning? (Decides the referral bonus.)
  const priorEarns = await prisma.loyaltyTransaction.count({
    where: { userId: buyerId, type: "EARN" },
  });

  if (points > 0) {
    try {
      // The partial unique index on LoyaltyTransaction (one EARN per sub-order)
      // makes this race-proof: a concurrent award trips the constraint and this
      // transaction rolls back, so the buyer is never credited twice.
      await prisma.$transaction(async (tx) => {
        await tx.loyaltyTransaction.create({
          data: {
            userId: buyerId,
            points,
            type: "EARN",
            orderId,
            subOrderId,
            note: "Purchase reward",
          },
        });
        await tx.user.update({
          where: { id: buyerId },
          data: { loyaltyPoints: { increment: points } },
        });
      });
    } catch (e) {
      // A concurrent award already granted this sub-order's points — stop here
      // so the referral bonus below isn't paid twice either.
      if (isUniqueViolation(e)) return;
      throw e;
    }
  }

  if (priorEarns === 0) {
    const buyer = await prisma.user.findUnique({
      where: { id: buyerId },
      select: { referredById: true, locale: true },
    });
    if (buyer?.referredById) {
      const already = await prisma.loyaltyTransaction.findFirst({
        where: { userId: buyer.referredById, type: "REFERRAL", note: buyerId },
        select: { id: true },
      });
      if (!already) {
        await prisma.loyaltyTransaction.create({
          data: {
            userId: buyer.referredById,
            points: REFERRAL_BONUS_POINTS,
            type: "REFERRAL",
            note: buyerId,
          },
        });
        await prisma.user.update({
          where: { id: buyer.referredById },
          data: { loyaltyPoints: { increment: REFERRAL_BONUS_POINTS } },
        });
        const ref = await prisma.user.findUnique({
          where: { id: buyer.referredById },
          select: { locale: true },
        });
        const ar = ref?.locale === "ar";
        await notify({
          userId: buyer.referredById,
          type: "PROMO",
          title: ar ? "مكافأة إحالة" : "Referral bonus",
          body: ar
            ? `حصلت على ${REFERRAL_BONUS_POINTS} نقطة لإحالتك صديقاً أتمّ أول طلب له.`
            : `You earned ${REFERRAL_BONUS_POINTS} points — a friend you referred completed their first order.`,
          link: "/account/loyalty",
        });
      }
    }
  }
}
