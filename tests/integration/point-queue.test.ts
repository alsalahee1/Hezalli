// Hub arrival queue & slot booking (docs/DELIVERY-POINTS.md §44): a fair
// arrival-ordered ticket per lane + reservable time slots, so the morning
// crowd doesn't fight over who drops/collects first. Runs against local
// Postgres. Covers walk-in ticket numbering, call/serve/no-show, booking +
// check-in, slot-full / already-queued guards, the disabled switch, and
// operator gating.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<typeof import("next-intl/server")>()),
  getLocale: vi.fn().mockResolvedValue("en"),
}));

import {
  bookPointSlot,
  callNextInQueue,
  cancelQueueEntry,
  checkInToPoint,
  markQueueNoShow,
  serveQueueEntry,
} from "@/lib/actions/point-queue";
import { minutesNowAden, serviceDayFor } from "@/lib/point-queue";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

// Open all day (open === close) so a bookable "current" slot always exists,
// whatever wall-clock time the suite runs at.
const ALL_DAY = Array.from({ length: 7 }, () => ({
  open: "00:00",
  close: "00:00",
}));

let ownerId: string;
let otherOwnerId: string;
let pointId: string;
let otherPointId: string;
const visitors: string[] = [];
// The current half-hour slot — never "past" (past = start + 30 ≤ now).
const currentSlot = Math.floor(minutesNowAden() / 30) * 30;

async function newUser(tag: string): Promise<string> {
  const u = await prisma.user.create({
    data: {
      email: `pq-${tag}-${Date.now().toString(36)}-${Math.floor(
        performance.now(),
      )}@t.local`,
      locale: "en",
    },
  });
  return u.id;
}

const entryOf = (userId: string) =>
  prisma.pointQueueEntry.findFirstOrThrow({
    where: { userId, pointId },
    orderBy: { createdAt: "desc" },
  });

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: { email: `pq-own-${uniq}@t.local`, roles: ["DELIVERY_POINT"] },
  });
  const otherOwner = await prisma.user.create({
    data: { email: `pq-own2-${uniq}@t.local`, roles: ["DELIVERY_POINT"] },
  });
  ownerId = owner.id;
  otherOwnerId = otherOwner.id;
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId,
      name: `Queue Point ${uniq}`,
      phone: "770000044",
      governorate: `QueueGov-${uniq}`,
      city: "Aden",
      addressLine: "Queue st",
      openingHours: ALL_DAY,
    },
  });
  const other = await prisma.deliveryPoint.create({
    data: {
      ownerId: otherOwnerId,
      name: `Other Point ${uniq}`,
      phone: "770000045",
      governorate: `QueueGov2-${uniq}`,
      city: "Aden",
      addressLine: "Other st",
      openingHours: ALL_DAY,
    },
  });
  pointId = point.id;
  otherPointId = other.id;
  for (const tag of ["v1", "v2", "v3", "v4", "v5", "v6"]) {
    visitors.push(await newUser(tag));
  }
  // Per-slot capacity of 1 makes the slot-full guard easy to exercise; walk-ins
  // (no slot) are unaffected.
  await prisma.platformSetting.upsert({
    where: { key: "queue_slot_capacity" },
    create: { key: "queue_slot_capacity", value: "1" },
    update: { value: "1" },
  });
});

afterAll(async () => {
  await prisma.platformSetting
    .deleteMany({
      where: { key: { in: ["queue_slot_capacity", "queue_enabled"] } },
    })
    .catch(() => {});
  await prisma.pointQueueEntry
    .deleteMany({ where: { pointId: { in: [pointId, otherPointId] } } })
    .catch(() => {});
  await prisma.auditLog
    .deleteMany({ where: { actorId: { in: [ownerId, otherOwnerId] } } })
    .catch(() => {});
  const everyone = [ownerId, otherOwnerId, ...visitors];
  await prisma.notification
    .deleteMany({ where: { userId: { in: everyone } } })
    .catch(() => {});
  await prisma.deliveryPoint
    .deleteMany({ where: { id: { in: [pointId, otherPointId] } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: everyone } } })
    .catch(() => {});
});

describe("hub arrival queue", () => {
  it("assigns fair per-lane ticket numbers on walk-in check-in", async () => {
    const [v1, v2, v3] = visitors;

    as(v1);
    expect(
      await checkInToPoint({ pointId, kind: "DROPOFF", parcelCount: 3 }),
    ).toMatchObject({ ok: true, ticketNo: 1 });

    as(v2);
    expect(await checkInToPoint({ pointId, kind: "DROPOFF" })).toMatchObject({
      ok: true,
      ticketNo: 2,
    });

    // The collection lane numbers independently.
    as(v3);
    expect(await checkInToPoint({ pointId, kind: "COLLECTION" })).toMatchObject(
      {
        ok: true,
        ticketNo: 1,
      },
    );

    // Checking in again is idempotent — same ticket, no new line entry.
    as(v1);
    expect(await checkInToPoint({ pointId })).toMatchObject({
      ok: true,
      ticketNo: 1,
    });
    expect((await entryOf(v1)).parcelCount).toBe(3);
  });

  it("calls the lowest ticket, notifies, serves, and clears no-shows", async () => {
    const [v1, v2] = visitors;

    // Call next in the drop-off lane → ticket #1 (v1).
    as(ownerId);
    expect(await callNextInQueue("DROPOFF")).toMatchObject({
      ok: true,
      ticketNo: 1,
    });
    const e1 = await entryOf(v1);
    expect(e1.status).toBe("SERVING");
    expect(e1.calledAt).toBeTruthy();
    // The called visitor was notified.
    expect(
      await prisma.notification.count({ where: { userId: v1 } }),
    ).toBeGreaterThanOrEqual(1);

    // Serve it → DONE.
    expect(await serveQueueEntry(e1.id)).toEqual({ ok: true });
    expect((await entryOf(v1)).status).toBe("DONE");

    // Next call → ticket #2 (v2); clear it as a no-show.
    expect(await callNextInQueue("DROPOFF")).toMatchObject({ ticketNo: 2 });
    const e2 = await entryOf(v2);
    expect(await markQueueNoShow(e2.id)).toEqual({ ok: true });
    expect((await entryOf(v2)).status).toBe("NO_SHOW");

    // Lane now empty.
    expect(await callNextInQueue("DROPOFF")).toEqual({ error: "empty" });
  });

  it("books a slot, then checks that booking into the line", async () => {
    const [, , , v4, v5] = visitors;

    as(v4);
    expect(
      await bookPointSlot({ pointId, kind: "DROPOFF", slotStart: currentSlot }),
    ).toEqual({ ok: true });
    const booked = await entryOf(v4);
    expect(booked.status).toBe("BOOKED");
    expect(booked.slotStart).toBe(currentSlot);
    expect(booked.serviceDay).toBe(serviceDayFor());

    // Same user can't double-book; a second visitor can't take the full slot.
    expect(
      await bookPointSlot({ pointId, kind: "DROPOFF", slotStart: currentSlot }),
    ).toEqual({ error: "alreadyQueued" });
    as(v5);
    expect(
      await bookPointSlot({ pointId, kind: "DROPOFF", slotStart: currentSlot }),
    ).toEqual({ error: "slotFull" });

    // v4 arrives → the booking flips to WAITING with the next drop-off ticket
    // (after #1 and #2 earlier today at this hub).
    as(v4);
    expect(await checkInToPoint({ pointId })).toMatchObject({
      ok: true,
      ticketNo: 3,
    });
    expect((await entryOf(v4)).status).toBe("WAITING");
  });

  it("lets a visitor cancel, and honours the disabled switch", async () => {
    const [, , , , v5, v6] = visitors;

    // v5 (no entry yet — the full-slot booking failed) checks in, then cancels.
    as(v5);
    await checkInToPoint({ pointId, kind: "COLLECTION" });
    const e5 = await entryOf(v5);
    expect(await cancelQueueEntry(e5.id)).toEqual({ ok: true });
    expect((await entryOf(v5)).status).toBe("CANCELLED");

    // Turn the queue off platform-wide → check-in refuses.
    await prisma.platformSetting.upsert({
      where: { key: "queue_enabled" },
      create: { key: "queue_enabled", value: "false" },
      update: { value: "false" },
    });
    as(v6);
    expect(await checkInToPoint({ pointId, kind: "DROPOFF" })).toEqual({
      error: "disabled",
    });
    await prisma.platformSetting.delete({ where: { key: "queue_enabled" } });
  });

  it("gates operator actions to the owning hub", async () => {
    const v3 = visitors[2]; // still WAITING in the collection lane (ticket #1)

    // A non-operator can't call the line.
    as(v3);
    expect(await callNextInQueue("COLLECTION")).toEqual({ error: "forbidden" });

    // A different hub's operator can't touch this hub's tickets.
    const e3 = await entryOf(v3);
    as(otherOwnerId);
    expect(await serveQueueEntry(e3.id)).toEqual({ error: "notFound" });
    expect((await entryOf(v3)).status).toBe("WAITING");
  });
});
