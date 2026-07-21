"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// A buyer rates the courier who delivered their Hezalli Express parcel. Allowed
// only for the order's own buyer, only on a delivered/completed EXPRESS
// sub-order that actually had a courier. Upserts by shipment so the buyer can
// change their rating.
export async function rateDelivery(
  shipmentId: string,
  stars: number,
  comment?: string,
): Promise<Result> {
  const session = await auth();
  const buyerId = session?.user?.id;
  if (!buyerId) return { error: "notSignedIn" };

  const n = Math.round(Number(stars));
  if (!Number.isFinite(n) || n < 1 || n > 5) return { error: "badStars" };

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      driverId: true,
      subOrder: {
        select: {
          status: true,
          shippingMethod: true,
          orderId: true,
          order: { select: { buyerId: true } },
        },
      },
    },
  });
  if (!shipment || !shipment.subOrder) return { error: "notFound" };
  const sub = shipment.subOrder;

  if (sub.order.buyerId !== buyerId) return { error: "forbidden" };
  if (!shipment.driverId) return { error: "noCourier" };
  if (sub.shippingMethod !== "EXPRESS") return { error: "notEligible" };
  if (sub.status !== "DELIVERED" && sub.status !== "COMPLETED")
    return { error: "notEligible" };

  await prisma.deliveryRating.upsert({
    where: { shipmentId },
    create: {
      shipmentId,
      courierId: shipment.driverId,
      buyerId,
      stars: n,
      comment: comment?.trim() || null,
    },
    update: { stars: n, comment: comment?.trim() || null },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/account/orders/${sub.orderId}`);
  return { ok: true };
}
