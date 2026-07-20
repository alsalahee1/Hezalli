"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryPoint } from "@/lib/authz";
import {
  buyerPickupAtPoint,
  handoverParcelToDriver,
  receiveParcelAtPoint,
  receiveReturnAtPoint,
  returnParcelToSeller,
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
