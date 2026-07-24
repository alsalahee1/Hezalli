"use server";

// Arrival queue & slot booking actions (docs/DELIVERY-POINTS.md §44). Two
// audiences:
//   - Visitors (any signed-in seller/driver): book a slot, check in on
//     arrival, cancel. Not point-gated — a visit is an intention, not custody.
//   - Operators (requireDeliveryPoint, any tier — running the line is core
//     counter work like scanning): call the next ticket, serve it, clear a
//     no-show.
// Like every point action these RETURN { error: "slug" } / { ok: true, ... }
// (never throw); the slug feeds the client's t(`err_${slug}`). The queue never
// touches custody or money — the real drop-off/collection stays the scan.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { requireDeliveryPoint } from "@/lib/authz";
import { notify } from "@/lib/notify";
import { bookableSlots, serviceDayFor } from "@/lib/point-queue";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";

type Kind = "DROPOFF" | "COLLECTION";
const OPEN = ["BOOKED", "WAITING", "SERVING"] as const;

type Result = { ok?: boolean; error?: string; ticketNo?: number | null };

function isKind(v: unknown): v is Kind {
  return v === "DROPOFF" || v === "COLLECTION";
}

function cleanParcelCount(v: unknown): number | null {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 999);
}

async function revalidateQueue(pointId?: string) {
  const locale = await getLocale();
  revalidatePath(`/${locale}/point/queue`);
  revalidatePath(`/${locale}/point`);
  if (pointId) revalidatePath(`/${locale}/points/${pointId}/queue`);
}

// Assign the next per-day, per-lane ticket number inside a transaction.
async function nextTicketNo(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  pointId: string,
  serviceDay: string,
  kind: Kind,
): Promise<number> {
  const agg = await tx.pointQueueEntry.aggregate({
    _max: { ticketNo: true },
    where: { pointId, serviceDay, kind, ticketNo: { not: null } },
  });
  return (agg._max.ticketNo ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Visitor actions
// ---------------------------------------------------------------------------

/** Reserve a future slot for today. Guards against a full slot / a double
 *  booking under a row-safe re-check inside the transaction. */
export async function bookPointSlot(input: {
  pointId: string;
  kind: string;
  slotStart: number;
  parcelCount?: number | null;
  note?: string | null;
}): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "unauthorized" };
  if (!isKind(input.kind)) return { error: "badInput" };
  const slotStart = Math.round(Number(input.slotStart));
  if (!Number.isFinite(slotStart)) return { error: "badInput" };

  // One open visit per hub — tell an already-queued caller so plainly, before
  // any slot-fullness talk (their own booking may be what filled the slot).
  const already = await prisma.pointQueueEntry.findFirst({
    where: { userId, pointId: input.pointId, status: { in: [...OPEN] } },
    select: { id: true },
  });
  if (already) return { error: "alreadyQueued" };

  const avail = await bookableSlots(input.pointId, input.kind);
  if (!avail.open) return { error: avail.reason };
  const slot = avail.slots.find((s) => s.start === slotStart);
  if (!slot || slot.past) return { error: "badSlot" };
  if (slot.full) return { error: "slotFull" };

  const serviceDay = serviceDayFor();
  const parcelCount =
    input.kind === "DROPOFF" ? cleanParcelCount(input.parcelCount) : null;
  const note = input.note?.trim().slice(0, 200) || null;

  const res = await prisma.$transaction(async (tx) => {
    const existing = await tx.pointQueueEntry.findFirst({
      where: { userId, pointId: input.pointId, status: { in: [...OPEN] } },
      select: { id: true },
    });
    if (existing) return { error: "alreadyQueued" as const };
    if (slot.capacity > 0) {
      const taken = await tx.pointQueueEntry.count({
        where: {
          pointId: input.pointId,
          kind: input.kind as Kind,
          serviceDay,
          slotStart,
          status: { in: [...OPEN] },
        },
      });
      if (taken >= slot.capacity) return { error: "slotFull" as const };
    }
    await tx.pointQueueEntry.create({
      data: {
        pointId: input.pointId,
        userId,
        kind: input.kind as Kind,
        status: "BOOKED",
        serviceDay,
        slotStart,
        parcelCount,
        note,
        bookedAt: new Date(),
      },
    });
    return { ok: true as const };
  });
  if (res.error) return { error: res.error };

  await audit(userId, "point.queueBook", "DeliveryPoint", input.pointId, {
    kind: input.kind,
    slotStart,
  });
  await revalidateQueue(input.pointId);
  return { ok: true };
}

/** Check in on arrival: flip an existing booking to WAITING (assigning a
 *  ticket), or create a walk-in ticket. Idempotent if already in line. */
export async function checkInToPoint(input: {
  pointId: string;
  kind?: string;
  entryId?: string;
  parcelCount?: number | null;
  note?: string | null;
}): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "unauthorized" };

  const settings = await getPlatformSettings();
  if (!settings.queue_enabled) return { error: "disabled" };
  const serviceDay = serviceDayFor();

  const res = await prisma.$transaction(async (tx) => {
    // Resolve the entry we're checking in: an explicit booking id, else the
    // caller's existing open entry at this hub, else a fresh walk-in.
    const entry = input.entryId
      ? await tx.pointQueueEntry.findUnique({ where: { id: input.entryId } })
      : await tx.pointQueueEntry.findFirst({
          where: { userId, pointId: input.pointId, status: { in: [...OPEN] } },
          orderBy: { createdAt: "desc" },
        });

    if (entry) {
      if (entry.userId !== userId || entry.pointId !== input.pointId) {
        return { error: "notFound" as const };
      }
      if (entry.status === "WAITING" || entry.status === "SERVING") {
        return { ok: true as const, ticketNo: entry.ticketNo }; // already in line
      }
      if (entry.status !== "BOOKED") return { error: "badState" as const };
      const ticketNo = await nextTicketNo(
        tx,
        input.pointId,
        serviceDay,
        entry.kind,
      );
      const updated = await tx.pointQueueEntry.update({
        where: { id: entry.id },
        data: { status: "WAITING", ticketNo, arrivedAt: new Date() },
      });
      return {
        ok: true as const,
        ticketNo: updated.ticketNo,
        kind: entry.kind,
        newArrival: true as const,
      };
    }

    // Walk-in: the hub must be open to new arrivals and a lane is required.
    if (!isKind(input.kind)) return { error: "badInput" as const };
    const point = await tx.deliveryPoint.findUnique({
      where: { id: input.pointId },
      select: { status: true, pausedAt: true },
    });
    if (!point || point.status !== "ACTIVE" || point.pausedAt) {
      return { error: "closed" as const };
    }
    const ticketNo = await nextTicketNo(
      tx,
      input.pointId,
      serviceDay,
      input.kind,
    );
    const created = await tx.pointQueueEntry.create({
      data: {
        pointId: input.pointId,
        userId,
        kind: input.kind,
        status: "WAITING",
        serviceDay,
        ticketNo,
        parcelCount:
          input.kind === "DROPOFF" ? cleanParcelCount(input.parcelCount) : null,
        note: input.note?.trim().slice(0, 200) || null,
        arrivedAt: new Date(),
      },
    });
    return {
      ok: true as const,
      ticketNo: created.ticketNo,
      kind: input.kind,
      newArrival: true as const,
    };
  });
  if (res.error) return { error: res.error };

  // Ping the hub owner that someone just joined the line — a doorbell for a
  // counter that isn't watching the queue screen. Only on a genuinely new
  // arrival (not an idempotent re-check-in).
  if (res.newArrival) {
    const point = await prisma.deliveryPoint.findUnique({
      where: { id: input.pointId },
      select: { ownerId: true, owner: { select: { locale: true } } },
    });
    if (point) {
      const ar = point.owner.locale === "ar";
      const lane =
        res.kind === "DROPOFF"
          ? ar
            ? "تسليم"
            : "drop-off"
          : ar
            ? "استلام"
            : "collection";
      await notify({
        userId: point.ownerId,
        type: "SHIPMENT",
        title: ar ? "وصول جديد إلى الطابور" : "New arrival in the queue",
        body: ar
          ? `التذكرة رقم ${res.ticketNo} (${lane}) بانتظار الخدمة.`
          : `Ticket #${res.ticketNo} (${lane}) is waiting to be served.`,
        link: `/point/queue`,
        data: { pointId: input.pointId },
      });
    }
  }

  await revalidateQueue(input.pointId);
  return { ok: true, ticketNo: res.ticketNo };
}

/** The visitor backs out of their own booking / ticket. */
export async function cancelQueueEntry(entryId: string): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "unauthorized" };
  const entry = await prisma.pointQueueEntry.findUnique({
    where: { id: entryId },
    select: { id: true, userId: true, pointId: true, status: true },
  });
  if (!entry || entry.userId !== userId) return { error: "notFound" };
  if (!OPEN.includes(entry.status as (typeof OPEN)[number])) {
    return { error: "badState" };
  }
  await prisma.pointQueueEntry.update({
    where: { id: entryId },
    data: { status: "CANCELLED" },
  });
  await revalidateQueue(entry.pointId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Operator actions
// ---------------------------------------------------------------------------

// Move a WAITING ticket to SERVING and notify the visitor. Shared by
// call-next and call-specific. Returns the served row for the caller.
async function callEntry(
  gatePointId: string,
  gateUserId: string,
  where: { id: string } | { pickNextKind: Kind },
): Promise<
  | { error: string }
  | {
      entry: {
        id: string;
        userId: string;
        ticketNo: number | null;
        kind: Kind;
      };
    }
> {
  const serviceDay = serviceDayFor();
  const picked = await prisma.$transaction(async (tx) => {
    const target =
      "id" in where
        ? await tx.pointQueueEntry.findUnique({ where: { id: where.id } })
        : await tx.pointQueueEntry.findFirst({
            where: {
              pointId: gatePointId,
              serviceDay,
              kind: where.pickNextKind,
              status: "WAITING",
            },
            orderBy: { ticketNo: "asc" },
          });
    if (!target) return { error: "id" in where ? "notFound" : "empty" };
    if (target.pointId !== gatePointId) return { error: "notFound" };
    if (target.status !== "WAITING") return { error: "badState" };
    const updated = await tx.pointQueueEntry.update({
      where: { id: target.id },
      data: { status: "SERVING", calledAt: new Date() },
    });
    return {
      entry: {
        id: updated.id,
        userId: updated.userId,
        ticketNo: updated.ticketNo,
        kind: updated.kind as Kind,
      },
    };
  });
  if ("error" in picked) return picked;

  await audit(gateUserId, "point.queueCall", "DeliveryPoint", gatePointId, {
    entryId: picked.entry.id,
    ticketNo: picked.entry.ticketNo,
  });
  await notify({
    userId: picked.entry.userId,
    type: "SHIPMENT",
    title: "You're being called to the counter",
    body: `Ticket ${picked.entry.ticketNo ?? ""} — please come to the desk now.`,
    link: `/points/${gatePointId}/queue`,
    data: { pointId: gatePointId, entryId: picked.entry.id },
  });
  return picked;
}

/** Call the lowest-ticket waiting visitor in a lane. */
export async function callNextInQueue(kind: string): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  if (!isKind(kind)) return { error: "badInput" };
  const res = await callEntry(gate.pointId, gate.userId, {
    pickNextKind: kind,
  });
  if ("error" in res) return { error: res.error };
  await revalidateQueue(gate.pointId);
  return { ok: true, ticketNo: res.entry.ticketNo };
}

/** Call one specific waiting ticket (operator picks out of order). */
export async function callQueueEntry(entryId: string): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const res = await callEntry(gate.pointId, gate.userId, { id: entryId });
  if ("error" in res) return { error: res.error };
  await revalidateQueue(gate.pointId);
  return { ok: true, ticketNo: res.entry.ticketNo };
}

/** Close a ticket as served. */
export async function serveQueueEntry(entryId: string): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const entry = await prisma.pointQueueEntry.findUnique({
    where: { id: entryId },
    select: { id: true, pointId: true, status: true },
  });
  if (!entry || entry.pointId !== gate.pointId) return { error: "notFound" };
  if (entry.status !== "WAITING" && entry.status !== "SERVING") {
    return { error: "badState" };
  }
  await prisma.pointQueueEntry.update({
    where: { id: entryId },
    data: { status: "DONE", servedAt: new Date() },
  });
  await audit(gate.userId, "point.queueServe", "DeliveryPoint", gate.pointId, {
    entryId,
  });
  await revalidateQueue(gate.pointId);
  return { ok: true };
}

/** Clear a ticket nobody answered (or a booking that never arrived). */
export async function markQueueNoShow(entryId: string): Promise<Result> {
  const gate = await requireDeliveryPoint();
  if (!gate) return { error: "forbidden" };
  const entry = await prisma.pointQueueEntry.findUnique({
    where: { id: entryId },
    select: { id: true, pointId: true, status: true },
  });
  if (!entry || entry.pointId !== gate.pointId) return { error: "notFound" };
  if (!OPEN.includes(entry.status as (typeof OPEN)[number])) {
    return { error: "badState" };
  }
  await prisma.pointQueueEntry.update({
    where: { id: entryId },
    data: { status: "NO_SHOW" },
  });
  await audit(gate.userId, "point.queueNoShow", "DeliveryPoint", gate.pointId, {
    entryId,
  });
  await revalidateQueue(gate.pointId);
  return { ok: true };
}
