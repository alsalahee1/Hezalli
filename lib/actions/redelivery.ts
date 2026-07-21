"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

type Result = { ok?: boolean; error?: string };

// How far ahead a buyer may book a redelivery.
const MAX_DAYS_AHEAD = 14;

// After a failed attempt (parcel FAILED with the driver, or RETURNED_TO_POINT
// at the hub) the buyer picks a new delivery day + optional note ("after 4pm",
// "call first"). Stored on the shipment; the point sees it on their dashboard
// and the driver on the job card.
export async function requestRedelivery(
  subOrderId: string,
  dateIso: string,
  note?: string,
): Promise<Result> {
  const session = await auth();
  const buyerId = session?.user?.id;
  if (!buyerId) return { error: "forbidden" };

  const day = new Date(dateIso);
  if (Number.isNaN(day.getTime())) return { error: "badDate" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const max = new Date(today.getTime() + MAX_DAYS_AHEAD * 86_400_000);
  if (day < today || day > max) return { error: "badDate" };

  const sub = await prisma.subOrder.findFirst({
    where: { id: subOrderId, order: { buyerId } },
    select: {
      id: true,
      status: true,
      orderId: true,
      shipment: {
        select: {
          id: true,
          status: true,
          driverId: true,
          deliveryPoint: { select: { ownerId: true, name: true } },
        },
      },
    },
  });
  if (!sub || !sub.shipment) return { error: "notFound" };
  if (sub.status !== "SHIPPED") return { error: "badState" };
  if (
    sub.shipment.status !== "FAILED" &&
    sub.shipment.status !== "RETURNED_TO_POINT"
  ) {
    return { error: "badState" };
  }

  const cleanNote = note?.trim().slice(0, 300) || null;
  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: sub.shipment.id },
      data: { redeliverAt: day, redeliverNote: cleanNote },
    }),
    prisma.shipmentEvent.create({
      data: {
        shipmentId: sub.shipment.id,
        status: sub.shipment.status,
        note: `Redelivery requested for ${day.toISOString().slice(0, 10)}`,
      },
    }),
    // Tell whoever currently holds the parcel.
    ...(sub.shipment.deliveryPoint
      ? [
          prisma.notification.create({
            data: {
              userId: sub.shipment.deliveryPoint.ownerId,
              type: "SHIPMENT",
              title: "Redelivery requested",
              body: `A buyer picked ${day.toISOString().slice(0, 10)} for a parcel held at ${sub.shipment.deliveryPoint.name}.`,
              data: { link: "/point" },
            },
          }),
        ]
      : []),
    ...(sub.shipment.driverId
      ? [
          prisma.notification.create({
            data: {
              userId: sub.shipment.driverId,
              type: "SHIPMENT",
              title: "Redelivery requested",
              body: `The buyer picked ${day.toISOString().slice(0, 10)} for one of your parcels.`,
              data: { link: "/driver" },
            },
          }),
        ]
      : []),
  ]);

  if (sub.shipment.driverId) {
    await sendPushToUser(sub.shipment.driverId, {
      title: "Redelivery requested",
      body: "A buyer picked a new delivery day for one of your parcels.",
      url: "/driver",
      tag: "redelivery",
      icon: "/driver-icon.svg",
    }).catch(() => {});
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/account/orders/${sub.orderId}`);
  return { ok: true };
}
