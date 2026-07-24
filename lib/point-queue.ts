// Hub arrival queue & drop-off/collection slots (docs/DELIVERY-POINTS.md §44).
// Two mechanisms that together defuse the morning crowd at a Hezalli Point:
//
//   1. Slot booking  — sellers/drivers reserve a time window, derived from the
//      hub's published opening hours, so arrivals spread across the day instead
//      of all landing at open.
//   2. Arrival queue — whoever is actually at the counter takes a numbered
//      ticket per lane (drop-offs vs collections); the operator serves in
//      arrival order, so "who's first" is a timestamp, not an argument.
//
// This module holds the slot math (pure) and the queue/slot reads; the state
// transitions live in lib/actions/point-queue.ts. Everything is scoped to an
// Asia/Aden "service day" (UTC+3, no DST — the same wall clock as
// lib/point-hours.ts) so ticket numbers reset each morning.
import {
  hasAnyHours,
  parseWeeklyHours,
  type DayHours,
  type WeeklyHours,
} from "@/lib/point-hours";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";

const OFFSET_MIN = 3 * 60; // Asia/Aden, UTC+3

// Open statuses = a live claim on a slot / a place in the line.
const OPEN_STATUSES = ["BOOKED", "WAITING", "SERVING"] as const;

function adenParts(now: Date): { day: number; minutes: number; ymd: string } {
  const t = new Date(now.getTime() + OFFSET_MIN * 60_000);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return {
    day: t.getUTCDay(),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
    ymd: `${y}-${m}-${d}`,
  };
}

/** The Asia/Aden service day ("YYYY-MM-DD") a moment belongs to. */
export function serviceDayFor(now: Date = new Date()): string {
  return adenParts(now).ymd;
}

/** Minutes past midnight on the Aden wall clock. */
export function minutesNowAden(now: Date = new Date()): number {
  return adenParts(now).minutes;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "HH:MM" for a minutes-past-midnight value (0–1439). */
export function formatSlot(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// The bookable minute window for one day: [start, end). `open === close` means
// open all day; an overnight window only offers today's portion (the spill into
// tomorrow morning is a different service day). Null = closed that day.
function windowBounds(day: DayHours): [number, number] | null {
  if (!day) return null;
  const o = toMin(day.open);
  const c = toMin(day.close);
  if (o === c) return [0, 1440];
  if (c > o) return [o, c];
  return [o, 1440];
}

/**
 * Slot-start minutes bookable for the weekday `now` falls on: the day's open
 * window sliced into whole `slotMinutes` chunks. Pure — the availability read
 * layers live counts on top.
 */
export function slotsForDay(
  hours: WeeklyHours,
  now: Date,
  slotMinutes: number,
): number[] {
  if (slotMinutes <= 0) return [];
  const bounds = windowBounds(hours[adenParts(now).day] ?? null);
  if (!bounds) return [];
  const [start, end] = bounds;
  const out: number[] = [];
  for (let m = start; m + slotMinutes <= end; m += slotMinutes) out.push(m);
  return out;
}

export type SlotOption = {
  start: number; // minutes past midnight
  label: string; // "HH:MM"
  taken: number; // live bookings + walk-ins holding this slot in this lane
  capacity: number; // 0 = uncapped
  full: boolean;
  past: boolean; // the slot has already fully elapsed today
};

export type SlotAvailability =
  | { open: false; reason: "disabled" | "closed" | "noHours" }
  | { open: true; slotMinutes: number; slots: SlotOption[] };

/**
 * The slots a visitor can book at `pointId` for `kind`, today, with their live
 * load. Closed when the queue is off platform-wide, the point isn't taking new
 * arrivals (suspended/paused), or the hub hasn't published opening hours.
 */
export async function bookableSlots(
  pointId: string,
  kind: "DROPOFF" | "COLLECTION",
  now: Date = new Date(),
): Promise<SlotAvailability> {
  const [settings, point] = await Promise.all([
    getPlatformSettings(),
    prisma.deliveryPoint.findUnique({
      where: { id: pointId },
      select: {
        status: true,
        pausedAt: true,
        openingHours: true,
        slotCapacity: true,
      },
    }),
  ]);
  if (!settings.queue_enabled) return { open: false, reason: "disabled" };
  if (!point || point.status !== "ACTIVE" || point.pausedAt) {
    return { open: false, reason: "closed" };
  }
  const hours = parseWeeklyHours(point.openingHours);
  if (!hours || !hasAnyHours(hours)) return { open: false, reason: "noHours" };

  const slotMinutes = settings.queue_slot_minutes;
  // Per-hub override wins; null falls back to the platform default.
  const capacity = point.slotCapacity ?? settings.queue_slot_capacity;
  const starts = slotsForDay(hours, now, slotMinutes);
  const serviceDay = serviceDayFor(now);
  const nowMin = minutesNowAden(now);

  const counts = await prisma.pointQueueEntry.groupBy({
    by: ["slotStart"],
    where: {
      pointId,
      kind,
      serviceDay,
      slotStart: { not: null },
      status: { in: [...OPEN_STATUSES] },
    },
    _count: { _all: true },
  });
  const taken = new Map<number, number>();
  for (const row of counts) {
    if (row.slotStart != null) taken.set(row.slotStart, row._count._all);
  }

  const slots: SlotOption[] = starts.map((start) => {
    const t = taken.get(start) ?? 0;
    return {
      start,
      label: formatSlot(start),
      taken: t,
      capacity,
      full: capacity > 0 && t >= capacity,
      past: start + slotMinutes <= nowMin,
    };
  });
  return { open: true, slotMinutes, slots };
}

export type QueueRow = {
  id: string;
  kind: "DROPOFF" | "COLLECTION";
  status: string;
  ticketNo: number | null;
  slotStart: number | null;
  slotLabel: string | null;
  parcelCount: number | null;
  note: string | null;
  userName: string | null;
  arrivedAt: Date | null;
  calledAt: Date | null;
};

export type LaneView = {
  serving: QueueRow[];
  waiting: QueueRow[];
  booked: QueueRow[];
};

export type LiveQueue = {
  serviceDay: string;
  dropoff: LaneView;
  collection: LaneView;
};

function toRow(e: {
  id: string;
  kind: "DROPOFF" | "COLLECTION";
  status: string;
  ticketNo: number | null;
  slotStart: number | null;
  parcelCount: number | null;
  note: string | null;
  arrivedAt: Date | null;
  calledAt: Date | null;
  user: { name: string | null } | null;
}): QueueRow {
  return {
    id: e.id,
    kind: e.kind,
    status: e.status,
    ticketNo: e.ticketNo,
    slotStart: e.slotStart,
    slotLabel: e.slotStart == null ? null : formatSlot(e.slotStart),
    parcelCount: e.parcelCount,
    note: e.note,
    userName: e.user?.name ?? null,
    arrivedAt: e.arrivedAt,
    calledAt: e.calledAt,
  };
}

function lane(rows: QueueRow[]): LaneView {
  return {
    serving: rows.filter((r) => r.status === "SERVING"),
    waiting: rows.filter((r) => r.status === "WAITING"),
    booked: rows.filter((r) => r.status === "BOOKED"),
  };
}

/**
 * Today's live queue for the operator: both lanes split into serving / waiting
 * (arrival order) / booked-for-later (slot order). Finished, cancelled, and
 * no-show tickets drop out.
 */
export async function liveQueue(
  pointId: string,
  now: Date = new Date(),
): Promise<LiveQueue> {
  const serviceDay = serviceDayFor(now);
  const entries = await prisma.pointQueueEntry.findMany({
    where: {
      pointId,
      serviceDay,
      status: { in: [...OPEN_STATUSES] },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      ticketNo: true,
      slotStart: true,
      parcelCount: true,
      note: true,
      arrivedAt: true,
      calledAt: true,
      user: { select: { name: true } },
    },
    orderBy: [{ ticketNo: "asc" }, { slotStart: "asc" }, { createdAt: "asc" }],
  });
  const rows = entries.map(toRow);
  return {
    serviceDay,
    dropoff: lane(rows.filter((r) => r.kind === "DROPOFF")),
    collection: lane(rows.filter((r) => r.kind === "COLLECTION")),
  };
}

export type MyQueue = {
  id: string;
  kind: "DROPOFF" | "COLLECTION";
  status: string;
  ticketNo: number | null;
  slotStart: number | null;
  slotLabel: string | null;
  parcelCount: number | null;
  ahead: number | null; // people waiting ahead of you (WAITING only)
};

/**
 * The visitor's own current entry at a hub (their ticket + how many are ahead),
 * or null if they have none open. Powers the self-service check-in page.
 */
export async function myQueueEntry(
  userId: string,
  pointId: string,
): Promise<MyQueue | null> {
  const entry = await prisma.pointQueueEntry.findFirst({
    where: { userId, pointId, status: { in: [...OPEN_STATUSES] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      status: true,
      ticketNo: true,
      slotStart: true,
      parcelCount: true,
      serviceDay: true,
    },
  });
  if (!entry) return null;
  let ahead: number | null = null;
  if (entry.status === "WAITING" && entry.ticketNo != null) {
    ahead = await prisma.pointQueueEntry.count({
      where: {
        pointId,
        serviceDay: entry.serviceDay,
        kind: entry.kind,
        status: "WAITING",
        ticketNo: { lt: entry.ticketNo },
      },
    });
  }
  return {
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    ticketNo: entry.ticketNo,
    slotStart: entry.slotStart,
    slotLabel: entry.slotStart == null ? null : formatSlot(entry.slotStart),
    parcelCount: entry.parcelCount,
    ahead,
  };
}

/** Waiting-count badge per lane, for the dashboard tile. */
export async function queueWaitingCounts(
  pointId: string,
  now: Date = new Date(),
): Promise<{ dropoff: number; collection: number }> {
  const serviceDay = serviceDayFor(now);
  const rows = await prisma.pointQueueEntry.groupBy({
    by: ["kind"],
    where: { pointId, serviceDay, status: "WAITING" },
    _count: { _all: true },
  });
  const by = new Map(rows.map((r) => [r.kind, r._count._all]));
  return {
    dropoff: by.get("DROPOFF") ?? 0,
    collection: by.get("COLLECTION") ?? 0,
  };
}
