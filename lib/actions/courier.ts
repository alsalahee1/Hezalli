"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryScope, requireCourierId } from "@/lib/authz";
import { codBlockedCourierIds } from "@/lib/cod-guard";
import { cascadeShipmentOffer, offerOpenStatuses } from "@/lib/courier-assign";
import {
  effectiveVehicleCapacity,
  hasRoomFor,
  subOrderMetric,
  subOrderMetrics,
  VEHICLE_CAPACITY_SETTING_KEY,
} from "@/lib/courier-capacity";
import { Prisma } from "@/lib/generated/prisma/client";
import { notifyBot } from "@/lib/integrations/bot-notify";
import { codSettledDigitally } from "@/lib/payment-state";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { settleReturnedSubOrder } from "@/lib/return-core";
import { getSetting } from "@/lib/settings";
import { markSubOrderDelivered } from "@/lib/shipment-core";
import { VEHICLE_TYPES } from "@/lib/validations/courier";
import { nearestGovernorate } from "@/lib/yemen-geo";

type Result = { ok?: boolean; error?: string };

// A driver shares their current location (opt-in). We store the raw point plus
// the nearest governorate, which "nearest" dispatch matches against.
export async function updateCourierLocation(
  lat: number,
  lng: number,
): Promise<{ ok?: boolean; error?: string; governorate?: string }> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return { error: "badLocation" };
  }
  const governorate = nearestGovernorate(lat, lng);
  await prisma.courierLocation.upsert({
    where: { userId: courierId },
    create: { userId: courierId, lat, lng, governorate },
    update: { lat, lng, governorate },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/driver`);
  return { ok: true, governorate };
}

// Vacation mode: the driver pauses NEW work — automatic assignment, offers,
// board pings, and board claims all skip them while paused. Jobs they
// already carry stay theirs to finish, and ops can still assign manually
// (same escape hatch as the COD guard). Self-service both ways.
export async function setCourierPaused(paused: boolean): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };

  await prisma.user.update({
    where: { id: courierId },
    data: { courierPausedAt: paused ? new Date() : null },
  });
  await prisma.auditLog.create({
    data: {
      actorId: courierId,
      action: "courier.pause",
      entity: "User",
      entityId: courierId,
      meta: { paused },
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/driver`);
  return { ok: true };
}

// Ops assigns (or reassigns / unassigns) a Hezalli Express shipment to a
// courier. Pass an empty driverId to unassign.
export async function assignCourier(
  shipmentId: string,
  driverId: string,
): Promise<Result> {
  const adminId = await requireDeliveryScope("DISPATCH");
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      platformManaged: true,
      subOrder: { select: { orderId: true } },
    },
  });
  if (!shipment) return { error: "notFound" };

  const id = driverId.trim();
  if (id) {
    // A Hezalli courier only carries Hezalli Express parcels. Attaching one to
    // an external-carrier shipment would let them "deliver" it (and capture its
    // COD onto their ledger) for a parcel Hezalli doesn't run — same guard the
    // bulk assign already enforces.
    if (!shipment.platformManaged) return { error: "notPlatformManaged" };
    const driver = await prisma.user.findUnique({
      where: { id },
      select: { roles: true, isSuspended: true, deletedAt: true },
    });
    if (
      !driver ||
      driver.isSuspended ||
      driver.deletedAt ||
      !driver.roles.includes("COURIER")
    ) {
      return { error: "invalidDriver" };
    }
  }

  // A manual dispatch decision overrides the offer flow: void any open offer
  // (its driver no longer holds the job) and clear the escalation flag so a
  // re-stranded parcel can alert staff again.
  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: shipmentId },
      data: { driverId: id || null, assignmentEscalatedAt: null },
    }),
    prisma.shipmentOffer.updateMany({
      where: { shipmentId, status: "OFFERED" },
      data: { status: "EXPIRED" },
    }),
  ]);

  if (id) {
    await prisma.notification.create({
      data: {
        userId: id,
        type: "SHIPMENT",
        title: "New delivery assigned",
        body: "A Hezalli Express delivery was assigned to you.",
        data: { link: "/driver" },
      },
    });
    // Ping the driver's phone (no-op unless push is configured).
    await sendPushToUser(id, {
      title: "New delivery assigned",
      body: "A Hezalli Express delivery was assigned to you.",
      url: "/driver",
      tag: "assignment",
      icon: "/driver-icon.svg",
    });
  }

  revalidatePath(`/${locale}/admin/dispatch`);
  revalidatePath(`/${locale}/driver`);
  return { ok: true };
}

// Ops sets (or clears) the vehicle a courier drives, which controls how much
// weight and how many parcels auto-assignment will hand them
// (lib/courier-capacity.ts). Normally copied from the approved application;
// this covers vehicle changes and couriers who were granted the role without
// one. Audited, since it changes who receives work.
export async function setCourierVehicle(
  courierId: string,
  vehicleType: string,
): Promise<Result> {
  const adminId = await requireDeliveryScope("FLEET");
  if (!adminId) return { error: "forbidden" };

  const vehicle = vehicleType.trim();
  if (vehicle && !(VEHICLE_TYPES as readonly string[]).includes(vehicle)) {
    return { error: "badVehicle" };
  }

  const courier = await prisma.user.findFirst({
    where: { id: courierId, roles: { has: "COURIER" }, deletedAt: null },
    select: { id: true, courierVehicleType: true },
  });
  if (!courier) return { error: "notFound" };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: courier.id },
      data: { courierVehicleType: vehicle || null },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "courier.vehicle",
        entity: "User",
        entityId: courier.id,
        meta: {
          from: courier.courierVehicleType,
          to: vehicle || null,
        },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/couriers/${courier.id}`);
  revalidatePath(`/${locale}/admin/dispatch`);
  return { ok: true };
}

// Ops tune what a vehicle class can carry — the capacity table auto-assignment
// checks parcels against (lib/courier-capacity.ts). Stored as a
// PlatformSetting override merged over the code defaults, so passing null
// reverts the vehicle to the shipped numbers. Inputs are in human units
// (kg / liters); stored in grams / cm³. Audited, since it changes which
// drivers receive which parcels.
export async function setVehicleCapacity(
  vehicleType: string,
  capacity: {
    maxWeightKg: number;
    maxVolumeLiters: number;
    maxParcels: number;
    maxItemLongestSideCm: number;
  } | null,
): Promise<Result> {
  const staffId = await requireDeliveryScope("FLEET");
  if (!staffId) return { error: "forbidden" };
  if (!(VEHICLE_TYPES as readonly string[]).includes(vehicleType)) {
    return { error: "badVehicle" };
  }
  const inRange = (v: number, max: number) =>
    Number.isFinite(v) && v > 0 && v <= max;
  if (
    capacity &&
    !(
      inRange(capacity.maxWeightKg, 20_000) &&
      inRange(capacity.maxVolumeLiters, 100_000) &&
      inRange(capacity.maxParcels, 500) &&
      inRange(capacity.maxItemLongestSideCm, 2_000)
    )
  ) {
    return { error: "badCapacity" };
  }

  const row = await prisma.platformSetting.findUnique({
    where: { key: VEHICLE_CAPACITY_SETTING_KEY },
    select: { value: true },
  });
  const overrides: Record<string, unknown> =
    typeof row?.value === "object" && row.value !== null
      ? { ...(row.value as Record<string, unknown>) }
      : {};
  const from = overrides[vehicleType] ?? null;
  const to = capacity
    ? {
        maxWeightGrams: Math.round(capacity.maxWeightKg * 1000),
        maxVolumeCm3: Math.round(capacity.maxVolumeLiters * 1000),
        maxParcels: Math.round(capacity.maxParcels),
        maxItemLongestSideCm: Math.round(capacity.maxItemLongestSideCm),
      }
    : null;
  if (to) overrides[vehicleType] = to;
  else delete overrides[vehicleType];

  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key: VEHICLE_CAPACITY_SETTING_KEY },
      create: {
        key: VEHICLE_CAPACITY_SETTING_KEY,
        value: overrides as Prisma.InputJsonValue,
      },
      update: { value: overrides as Prisma.InputJsonValue },
    }),
    prisma.auditLog.create({
      data: {
        actorId: staffId,
        action: "vehicle.capacity",
        entity: "PlatformSetting",
        entityId: VEHICLE_CAPACITY_SETTING_KEY,
        meta: { vehicleType, from, to } as Prisma.InputJsonValue,
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/delivery-manager/vehicles`);
  revalidatePath(`/${locale}/admin/couriers`);
  return { ok: true };
}

// Ops assigns several unassigned parcels to one courier in a single action
// (e.g. "give this driver everything in Sana'a"). Race-guarded: only parcels
// that are still platform-managed AND unassigned are claimed, so it never
// steals a parcel another dispatcher just assigned. Notifies + pushes once.
export async function assignManyCouriers(
  shipmentIds: string[],
  driverId: string,
): Promise<Result & { count?: number }> {
  const adminId = await requireDeliveryScope("DISPATCH");
  if (!adminId) return { error: "forbidden" };
  const id = driverId.trim();
  if (!id) return { error: "invalidDriver" };
  const ids = Array.from(new Set(shipmentIds.filter(Boolean)));
  if (ids.length === 0) return { error: "noParcels" };

  const driver = await prisma.user.findUnique({
    where: { id },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (
    !driver ||
    driver.isSuspended ||
    driver.deletedAt ||
    !driver.roles.includes("COURIER")
  ) {
    return { error: "invalidDriver" };
  }

  const claimed = await prisma.shipment.updateMany({
    where: { id: { in: ids }, driverId: null, platformManaged: true },
    data: { driverId: id, assignmentEscalatedAt: null },
  });
  const count = claimed.count;

  if (count > 0) {
    await prisma.notification.create({
      data: {
        userId: id,
        type: "SHIPMENT",
        title: "New deliveries assigned",
        body: `${count} Hezalli Express deliveries were assigned to you.`,
        data: { link: "/driver" },
      },
    });
    await sendPushToUser(id, {
      title: "New deliveries assigned",
      body: `${count} Hezalli Express deliveries were assigned to you.`,
      url: "/driver",
      tag: "assignment",
      icon: "/driver-icon.svg",
    }).catch(() => {});
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/dispatch`);
  revalidatePath(`/${locale}/driver`);
  return { ok: true, count };
}

// Reasons a driver can decline an offered job. Kept in sync with the decline
// picker and the `Driver.declineReason_*` i18n keys.
const DECLINE_REASONS = new Set([
  "too_far",
  "off_duty",
  "too_many_jobs",
  "other",
]);

// Driver answers a pending job offer: accept locks the job in; decline hands
// the parcel back and immediately cascades it to the next courier (or alerts
// dispatch when nobody is left). Advancing the shipment (first scan) accepts
// implicitly — see courierAdvance.
export async function courierRespondOffer(
  shipmentId: string,
  response: "ACCEPT" | "DECLINE",
  reason?: string,
): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  const locale = await getLocale();

  const offer = await prisma.shipmentOffer.findUnique({
    where: { shipmentId_driverId: { shipmentId, driverId: courierId } },
    select: {
      id: true,
      status: true,
      shipment: {
        select: { status: true, driverId: true, deliveryPointId: true },
      },
    },
  });
  // Only a live offer for a parcel the driver still holds can be answered. An
  // offer whose window lapsed but wasn't swept yet is still answerable —
  // accept wins over a pending expiry.
  if (
    !offer ||
    offer.status !== "OFFERED" ||
    offer.shipment.driverId !== courierId
  ) {
    return { error: "notFound" };
  }

  if (response === "ACCEPT") {
    await prisma.shipmentOffer.updateMany({
      where: { id: offer.id, status: "OFFERED" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    revalidatePath(`/${locale}/driver`);
    return { ok: true };
  }

  if (!DECLINE_REASONS.has(reason ?? "")) return { error: "badReason" };
  // Declining is only possible before the first scan. After that the parcel
  // (and its COD accountability) is the driver's; problems then go through
  // courierFailDelivery or dispatch, never a silent hand-back.
  const openStatuses = offerOpenStatuses(offer.shipment.deliveryPointId);
  if (!(openStatuses as string[]).includes(offer.shipment.status)) {
    return { error: "badState" };
  }

  const released = await prisma.$transaction(async (tx) => {
    const o = await tx.shipmentOffer.updateMany({
      where: { id: offer.id, status: "OFFERED" },
      data: { status: "REJECTED", reason, respondedAt: new Date() },
    });
    if (o.count !== 1) return false;
    const s = await tx.shipment.updateMany({
      where: {
        id: shipmentId,
        driverId: courierId,
        status: { in: openStatuses },
      },
      data: { driverId: null },
    });
    return s.count === 1;
  });
  if (!released) return { error: "badState" };

  // Move the parcel along right away — an honest "no" should cost the buyer
  // minutes, not hours. Best-effort: the cron sweep is the safety net.
  try {
    await cascadeShipmentOffer(shipmentId);
  } catch {
    // The offer sweep will retry the cascade.
  }

  revalidatePath(`/${locale}/driver`);
  revalidatePath(`/${locale}/admin/dispatch`);
  return { ok: true };
}

// Driver claims a parcel off the open job board (docs/EXPRESS-DELIVERY.md
// §4b): first tap wins, decided by one conditional update on the unassigned
// row. Claiming is a commitment — it is recorded as an ACCEPTED offer, so it
// counts toward the driver's acceptance history and, like an accepted push
// offer, can't be handed back silently (problems go through
// courierFailDelivery or dispatch). The same eligibility gates as
// auto-dispatch apply: COD-blocked drivers can't claim, and
// `job_board_max_active_jobs` caps how many in-flight jobs a driver may hold.
export async function courierClaimJob(shipmentId: string): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      driverId: true,
      boardedAt: true,
      platformManaged: true,
      status: true,
      deliveryPointId: true,
      atPointId: true,
      subOrderId: true,
      subOrder: { select: { status: true, shippingMethod: true } },
    },
  });
  const ready =
    shipment &&
    shipment.platformManaged &&
    shipment.boardedAt &&
    shipment.subOrder?.status === "SHIPPED" &&
    shipment.subOrder.shippingMethod !== "PICKUP" &&
    (shipment.deliveryPointId
      ? shipment.status === "AT_POINT" &&
        shipment.atPointId === shipment.deliveryPointId
      : ["PENDING", "LABEL_CREATED", "IN_TRANSIT"].includes(shipment.status));
  if (!ready) return { error: "notFound" };
  if (shipment.driverId) return { error: "taken" };

  // Same COD credit gate as auto-dispatch: cash out, no new work.
  const blocked = await codBlockedCourierIds([courierId]);
  if (blocked.has(courierId)) return { error: "codBlocked" };

  // Anti-hoarding cap + the physical gate: what the driver already carries.
  const [driver, active, maxJobs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: courierId },
      select: { courierVehicleType: true, courierPausedAt: true },
    }),
    prisma.shipment.findMany({
      where: { driverId: courierId, subOrder: { status: "SHIPPED" } },
      select: { subOrderId: true },
    }),
    getSetting("job_board_max_active_jobs"),
  ]);
  // Vacation mode: paused means no NEW work — resume from the home page first.
  if (driver?.courierPausedAt) return { error: "paused" };
  if (maxJobs > 0 && active.length >= maxJobs) {
    return { error: "tooManyJobs" };
  }

  // Vehicle capacity (lib/courier-capacity.ts): the same gate auto-assign
  // applies — a bicycle courier can't claim a washing machine, or stack more
  // weight/volume than their vehicle carries. Unknown vehicles pass, like in
  // auto-assign.
  const [loadMetrics, parcel, capacityTable] = await Promise.all([
    subOrderMetrics(active.map((s) => s.subOrderId)),
    subOrderMetric(shipment.subOrderId),
    effectiveVehicleCapacity(),
  ]);
  let loadWeightGrams = 0;
  let loadVolumeCm3 = 0;
  for (const m of loadMetrics.values()) {
    loadWeightGrams += m.weightGrams;
    loadVolumeCm3 += m.volumeCm3;
  }
  if (
    !hasRoomFor(
      {
        vehicleType: driver?.courierVehicleType ?? null,
        load: active.length,
        loadWeightGrams,
        loadVolumeCm3,
      },
      parcel,
      capacityTable,
    )
  ) {
    return { error: "noCapacity" };
  }

  // The race decider: whoever flips the unassigned row wins. Clearing the
  // escalation flag mirrors a manual dispatch assignment — the parcel is no
  // longer stranded, so a future re-strand may alert staff again.
  const claimed = await prisma.shipment.updateMany({
    where: { id: shipmentId, driverId: null },
    data: { driverId: courierId, assignmentEscalatedAt: null },
  });
  if (claimed.count !== 1) return { error: "taken" };

  // Record the claim as an accepted offer so reliability stats and the offer
  // history read the same for pull and push. Upsert: a driver who earlier
  // declined this parcel's push offer may still change their mind here.
  await prisma.shipmentOffer.upsert({
    where: { shipmentId_driverId: { shipmentId, driverId: courierId } },
    create: {
      shipmentId,
      driverId: courierId,
      status: "ACCEPTED",
      respondedAt: new Date(),
      expiresAt: new Date(),
    },
    update: { status: "ACCEPTED", reason: null, respondedAt: new Date() },
  });

  revalidatePath(`/${locale}/driver`);
  revalidatePath(`/${locale}/driver/board`);
  revalidatePath(`/${locale}/admin/dispatch`);
  return { ok: true };
}

export type CourierAction = "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED";

// Proof captured on the "Delivered" tap (all optional).
export type DeliveryProofInput = {
  recipientName?: string;
  photoKey?: string;
  note?: string;
  // The buyer's delivery code (typed or scanned from their QR). When present
  // it must match the shipment's code; a match is recorded as verified proof.
  deliveryCode?: string;
};

// Reasons a doorstep delivery can fail. Kept in sync with the driver reason
// picker and the `Driver.failReason_*` i18n keys.
const FAIL_REASONS = new Set([
  "unreachable",
  "refused",
  "wrong_address",
  "rescheduled",
  "other",
]);

// Driver advances one of their assigned shipments through the delivery states.
// DELIVERED defers to the shared core (COD capture, auto-complete, buyer notice).
export async function courierAdvance(
  shipmentId: string,
  action: CourierAction,
  proof?: DeliveryProofInput,
): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, driverId: courierId },
    select: {
      id: true,
      status: true,
      deliveryPointId: true,
      deliveryCode: true,
      subOrder: {
        select: {
          id: true,
          status: true,
          orderId: true,
          store: { select: { name: true } },
          order: {
            select: {
              buyerId: true,
              paymentMethod: true,
              payment: { select: { status: true, confirmedBy: true } },
              buyer: { select: { locale: true } },
            },
          },
        },
      },
    },
  });
  if (!shipment || !shipment.subOrder) return { error: "notFound" };
  const sub = shipment.subOrder;
  // Only an in-flight (SHIPPED) sub-order can be advanced by a driver.
  if (sub.status !== "SHIPPED") return { error: "badState" };
  // A point-routed parcel moves through its hub, never the driver's phone,
  // while the point holds it (LABEL_CREATED/AT_POINT/RETURNED_TO_POINT) OR
  // while it is IN_TRANSIT on the line-haul leg — there the assigned driver is
  // the TRANSFER driver carrying it between hubs, whose custody ends at the
  // destination point's receive scan. Only the last-mile driver, after that
  // scan (status OUT_FOR_DELIVERY), delivers. Direct parcels have no delivery
  // point, so this never blocks them.
  if (
    shipment.deliveryPointId &&
    ["LABEL_CREATED", "AT_POINT", "RETURNED_TO_POINT", "IN_TRANSIT"].includes(
      shipment.status,
    )
  ) {
    return { error: "badState" };
  }

  // Working the parcel IS accepting it: the first scan settles any pending
  // offer so the accept window stops ticking (drivers who act never time out).
  await prisma.shipmentOffer.updateMany({
    where: { shipmentId, driverId: courierId, status: "OFFERED" },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  });

  if (action === "DELIVERED") {
    // Optional strongest proof: the buyer's delivery code (typed or scanned
    // from their QR). Wrong code = hard error; empty = ordinary proof.
    const typed = proof?.deliveryCode?.trim().toUpperCase();
    if (typed && typed !== shipment.deliveryCode?.toUpperCase()) {
      return { error: "badCode" };
    }
    // A COD drop must carry SOME proof of handover — the buyer's code, a
    // doorstep photo, or a recipient name. The driver becomes accountable for
    // the cash either way, but without evidence an "I never received it"
    // dispute has nothing to weigh. Prepaid drops stay frictionless, and a COD
    // order already settled digitally (no cash due) is treated as prepaid.
    const recipient = proof?.recipientName?.trim();
    const codCashDue =
      sub.order.paymentMethod === "COD" && !codSettledDigitally(sub.order);
    if (codCashDue && !typed && !proof?.photoKey && !recipient) {
      return { error: "proofRequired" };
    }
    const res = await markSubOrderDelivered(sub.id, "courier", locale, {
      courierId,
      recipientName: proof?.recipientName,
      photoKey: proof?.photoKey,
      note: proof?.note,
      codeVerified: Boolean(typed),
    });
    revalidatePath(`/${locale}/driver`);
    revalidatePath(`/${locale}/driver/job/${shipmentId}`);
    return res;
  }

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: { status: action },
    });
    await tx.shipmentEvent.create({
      data: { shipmentId, status: action },
    });
    // Tell the buyer when their parcel is out for delivery.
    if (action === "OUT_FOR_DELIVERY") {
      const ar = sub.order.buyer.locale === "ar";
      await tx.notification.create({
        data: {
          userId: sub.order.buyerId,
          type: "SHIPMENT",
          title: ar ? "طلبك في الطريق إليك" : "Your order is out for delivery",
          body: ar
            ? `خرج طلبك من ${sub.store.name} للتوصيل وسيصلك قريبًا.`
            : `Your order from ${sub.store.name} is out for delivery.`,
          data: { orderId: sub.orderId },
        },
      });
    }
  });

  if (action === "OUT_FOR_DELIVERY") {
    const ar = sub.order.buyer.locale === "ar";
    await notifyBot(
      sub.order.buyerId,
      ar
        ? `🛵 طلبك من ${sub.store.name} في الطريق إليك الآن.`
        : `🛵 Your order from ${sub.store.name} is out for delivery now.`,
    );
  }

  revalidatePath(`/${locale}/driver`);
  revalidatePath(`/${locale}/driver/job/${shipmentId}`);
  return { ok: true };
}

// Driver logs a FAILED doorstep attempt (customer unreachable, refused, wrong
// address, asked to reschedule…). The parcel stays with the courier (sub-order
// remains SHIPPED) so it can be re-attempted or reassigned from dispatch; the
// Shipment flips to FAILED and the reason is recorded as a DeliveryAttempt.
export async function courierFailDelivery(
  shipmentId: string,
  reason: string,
  note?: string,
): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  if (!FAIL_REASONS.has(reason)) return { error: "badReason" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, driverId: courierId },
    select: {
      id: true,
      status: true,
      deliveryPointId: true,
      attemptCount: true,
      subOrder: {
        select: {
          id: true,
          status: true,
          orderId: true,
          store: {
            select: {
              name: true,
              seller: {
                select: {
                  userId: true,
                  user: { select: { locale: true } },
                },
              },
            },
          },
          order: {
            select: { buyerId: true, buyer: { select: { locale: true } } },
          },
        },
      },
    },
  });
  if (!shipment || !shipment.subOrder) return { error: "notFound" };
  const sub = shipment.subOrder;
  if (sub.status !== "SHIPPED") return { error: "badState" };
  // A FAILED attempt means a doorstep delivery was actually tried, so the
  // parcel must be OUT_FOR_DELIVERY — the driver has taken it out. This blocks
  // failing a parcel still at a point, in line-haul, or merely picked up, so a
  // driver can't rack up attempts toward a forced RETURN without a real try.
  if (shipment.status !== "OUT_FOR_DELIVERY") return { error: "badState" };

  // A DIRECT parcel (no delivery point) that has now exhausted its allowed
  // attempts is returned to the seller instead of sitting FAILED-and-retriable
  // forever. Point-routed parcels keep flowing back through the point.
  const maxAttempts = await getSetting("max_delivery_attempts");
  const willReturn =
    !shipment.deliveryPointId && shipment.attemptCount + 1 >= maxAttempts;

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        status: willReturn ? "RETURNED" : "FAILED",
        attemptCount: { increment: 1 },
      },
    });
    // The localized status label carries the meaning on the public timeline;
    // only the courier's free note (if any) is shown alongside it. The
    // machine-readable reason lives on the DeliveryAttempt for ops.
    await tx.shipmentEvent.create({
      data: {
        shipmentId,
        status: willReturn ? "RETURNED" : "FAILED",
        note: note?.trim() || null,
      },
    });
    await tx.deliveryAttempt.create({
      data: {
        shipmentId,
        courierId,
        outcome: "FAILED",
        reason,
        note: note?.trim() || null,
      },
    });
    // While still retriable, tell the buyer we'll try again. When the parcel is
    // being returned, settleReturnedSubOrder sends the final (refund/cancel)
    // notice instead, so we don't double-notify here.
    if (!willReturn) {
      const ar = sub.order.buyer.locale === "ar";
      await tx.notification.create({
        data: {
          userId: sub.order.buyerId,
          type: "SHIPMENT",
          title: ar ? "تعذّر توصيل طلبك" : "Delivery attempt unsuccessful",
          body: ar
            ? `حاول مندوبنا توصيل طلبك من ${sub.store.name} ولم يتمكّن. سنعيد المحاولة قريبًا.`
            : `Our courier tried to deliver your order from ${sub.store.name} but couldn't. We'll try again soon.`,
          data: { orderId: sub.orderId },
        },
      });
    }
  });

  if (willReturn) {
    // Resolve the order (refund-if-paid / cancel + restock) via the shared
    // money-path, then tell the seller their parcel is coming back.
    await settleReturnedSubOrder(sub.id);
    const sellerUserId = sub.store.seller?.userId;
    if (sellerUserId) {
      const sellerAr = sub.store.seller?.user?.locale === "ar";
      await prisma.notification.create({
        data: {
          userId: sellerUserId,
          type: "SHIPMENT",
          title: sellerAr
            ? "طرد مرتجع بعد تعذّر التوصيل"
            : "A parcel is being returned to you",
          body: sellerAr
            ? `تعذّر توصيل أحد طلباتك بعد ${maxAttempts} محاولات وسيُعاد إليك.`
            : `A parcel couldn't be delivered after ${maxAttempts} attempts and is being returned to you.`,
          data: { subOrderId: sub.id },
        },
      });
    }
  }

  revalidatePath(`/${locale}/driver`);
  revalidatePath(`/${locale}/driver/job/${shipmentId}`);
  revalidatePath(`/${locale}/admin/dispatch`);
  return { ok: true };
}
