"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryPoint } from "@/lib/authz";
import { cashBlockedPointIds } from "@/lib/cod-guard";
import { courierCashSummary } from "@/lib/courier-ledger";
import { prisma } from "@/lib/prisma";
import {
  buyerPickupAtPoint,
  driverManifestAtPoint,
  handoverManifestToDriver,
  handoverParcelToDriver,
  receiveParcelAtPoint,
  receiveReturnAtPoint,
  returnParcelToSeller,
  type ManifestRow,
} from "@/lib/point-core";

type Result = { ok?: boolean; error?: string };

async function revalidatePoint() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/point`);
  revalidatePath(`/${locale}/point/scan`);
  revalidatePath(`/${locale}/admin/dispatch`);
}

// Seller drop-off scan: the point takes custody of an announced parcel.
export async function pointReceiveParcel(tracking: string): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const res = await receiveParcelAtPoint(gate.pointId, tracking);
  if (res.ok) await revalidatePoint();
  return res;
}

// Courier collection scan: hand a held parcel to a driver (assigning it to
// them when it was still unassigned).
export async function pointHandoverParcel(
  tracking: string,
  driverId?: string,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const res = await handoverParcelToDriver(gate.pointId, tracking, driverId);
  if (res.ok) await revalidatePoint();
  return res;
}

// The driver's pickup list at this hub (docs §26) — shown when the counter
// scans a driver's collection QR or picks them from the list.
export async function pointDriverManifest(
  driverId: string,
): Promise<{ ok?: boolean; error?: string; rows?: ManifestRow[] }> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const id = driverId.trim();
  if (!id) return { error: "driverRequired" };
  return { ok: true, rows: await driverManifestAtPoint(gate.pointId, id) };
}

// Hand the driver their whole manifest in one go. Each parcel still runs the
// race-guarded per-parcel transition; concurrent claims just drop out.
export async function pointHandoverManifest(
  driverId: string,
): Promise<{ ok?: boolean; error?: string; handed?: number; failed?: number }> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const id = driverId.trim();
  if (!id) return { error: "driverRequired" };
  const res = await handoverManifestToDriver(gate.pointId, id);
  if (res.handed > 0) await revalidatePoint();
  return { ok: true, ...res };
}

// Failed-delivery return scan: the parcel comes back from the driver.
export async function pointReceiveReturn(
  tracking: string,
  note?: string,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const res = await receiveReturnAtPoint(gate.pointId, tracking, note);
  if (res.ok) await revalidatePoint();
  return res;
}

// Counter pickup: the buyer shows their delivery QR/code and takes the
// parcel. Returns the COD amount the counter must collect (0 for prepaid).
export async function pointBuyerPickup(
  code: string,
): Promise<{ ok?: boolean; error?: string; codDue?: number }> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const locale = await getLocale();
  const res = await buyerPickupAtPoint(gate.pointId, code, locale);
  if (res.ok) await revalidatePoint();
  return res;
}

// A courier hands COD cash in at the counter (docs §12): one atomic double
// entry — courier REMITTANCE (−) and point DRIVER_CASH_IN (+). The amount may
// not exceed the driver's current cash-on-hand.
export async function pointDriverCashIn(
  driverId: string,
  amount: number,
  note?: string,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const amountUsd = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { error: "badAmount" };
  }

  const [driver, point] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: driverId.trim(),
        roles: { has: "COURIER" },
        isSuspended: false,
        deletedAt: null,
      },
      select: { id: true, name: true, email: true },
    }),
    prisma.deliveryPoint.findUnique({
      where: { id: gate.pointId },
      select: { name: true },
    }),
  ]);
  if (!driver) return { error: "invalidDriver" };

  // A point already over its unremitted-cash limit may not concentrate even
  // more of Hezalli's cash — the driver remits at another point or the office.
  if ((await cashBlockedPointIds([gate.pointId])).has(gate.pointId)) {
    return { error: "cashLimit" };
  }

  const cash = await courierCashSummary(driver.id);
  if (amountUsd > cash.cashOnHand + 0.001) return { error: "overRemit" };

  const cleanNote = note?.trim().slice(0, 200) || null;
  await prisma.$transaction([
    prisma.courierLedgerEntry.create({
      data: {
        courierId: driver.id,
        type: "REMITTANCE",
        amountUsd: -amountUsd,
        note: cleanNote ?? `Handed in at ${point?.name ?? "Hezalli Point"}`,
        createdById: gate.userId,
      },
    }),
    prisma.deliveryPointLedgerEntry.create({
      data: {
        pointId: gate.pointId,
        type: "DRIVER_CASH_IN",
        amountUsd,
        note: `From driver ${driver.name ?? driver.email ?? driver.id.slice(-6)}`,
        createdById: gate.userId,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: gate.userId,
        action: "point.driverCashIn",
        entity: "DeliveryPoint",
        entityId: gate.pointId,
        meta: { driverId: driver.id, amountUsd },
      },
    }),
    prisma.notification.create({
      data: {
        userId: driver.id,
        type: "SHIPMENT",
        title: "Cash hand-in recorded",
        body: `${point?.name ?? "A Hezalli Point"} recorded ${amountUsd.toFixed(2)} USD handed in from your COD cash.`,
        data: { link: "/driver" },
      },
    }),
  ]);

  await revalidatePoint();
  return { ok: true };
}

// Terminal RTS scan: the point sends the parcel back to the seller.
export async function pointReturnToSeller(
  tracking: string,
  note?: string,
): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const res = await returnParcelToSeller(gate.pointId, tracking, note);
  if (res.ok) await revalidatePoint();
  return res;
}
