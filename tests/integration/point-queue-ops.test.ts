// Queue operations (docs §46): no-show auto-expiry sweep, the queue analytics
// summary, and the operator new-arrival ping. Runs against local Postgres.
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

import { checkInToPoint } from "@/lib/actions/point-queue";
import { sweepQueueNoShows } from "@/lib/point-queue-sweep";
import { minutesNowAden, myQueueEntry, serviceDayFor } from "@/lib/point-queue";
import { queueStats } from "@/lib/point-stats";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

const ALL_DAY = Array.from({ length: 7 }, () => ({
  open: "00:00",
  close: "00:00",
}));

let ownerId: string;
const pointIds: string[] = [];
const userIds: string[] = [];

async function newUser(tag: string): Promise<string> {
  const u = await prisma.user.create({
    data: {
      email: `pqo-${tag}-${Date.now().toString(36)}-${Math.floor(
        performance.now(),
      )}@t.local`,
      locale: "en",
    },
  });
  userIds.push(u.id);
  return u.id;
}

async function newPoint(tag: string): Promise<string> {
  const p = await prisma.deliveryPoint.create({
    data: {
      ownerId,
      name: `Ops Point ${tag}`,
      phone: "770000066",
      governorate: `OpsGov-${tag}-${Date.now().toString(36)}`,
      city: "Aden",
      addressLine: "Ops st",
      openingHours: ALL_DAY,
    },
  });
  pointIds.push(p.id);
  return p.id;
}

beforeAll(async () => {
  const owner = await prisma.user.create({
    data: {
      email: `pqo-own-${Date.now().toString(36)}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  ownerId = owner.id;
});

afterAll(async () => {
  const everyone = [ownerId, ...userIds];
  await prisma.pointQueueEntry
    .deleteMany({ where: { pointId: { in: pointIds } } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: everyone } } })
    .catch(() => {});
  await prisma.deliveryPoint
    .deleteMany({ where: { id: { in: pointIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: everyone } } })
    .catch(() => {});
});

describe("no-show auto-expiry sweep", () => {
  it("expires a stale prior-day booking and frees the visitor", async () => {
    const pointId = await newPoint("sweep");
    const vUser = await newUser("sweep");

    // A booking left open from yesterday (a different service day).
    const stale = await prisma.pointQueueEntry.create({
      data: {
        pointId,
        userId: vUser,
        kind: "DROPOFF",
        status: "BOOKED",
        serviceDay: "2000-01-01",
        slotStart: 600,
        bookedAt: new Date(),
      },
    });

    // Before the sweep it would resurface as the visitor's current ticket.
    expect(await myQueueEntry(vUser, pointId)).not.toBeNull();

    const res = await sweepQueueNoShows();
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect(
      (
        await prisma.pointQueueEntry.findUniqueOrThrow({
          where: { id: stale.id },
          select: { status: true },
        })
      ).status,
    ).toBe("NO_SHOW");
    // No longer counts as the visitor's open entry.
    expect(await myQueueEntry(vUser, pointId)).toBeNull();
  });

  it("expires today's booking once its slot + grace has passed", async () => {
    // Only exercisable once the clock is past 2 slot-lengths into the day.
    const nowMin = minutesNowAden();
    if (nowMin < 60) return; // ~before 01:00 Aden — skip, nothing to assert
    const pointId = await newPoint("today");
    const vUser = await newUser("today");
    const passed = await prisma.pointQueueEntry.create({
      data: {
        pointId,
        userId: vUser,
        kind: "DROPOFF",
        status: "BOOKED",
        serviceDay: serviceDayFor(),
        slotStart: 0, // 00:00 — well past by now
        bookedAt: new Date(),
      },
    });
    await sweepQueueNoShows();
    expect(
      (
        await prisma.pointQueueEntry.findUniqueOrThrow({
          where: { id: passed.id },
          select: { status: true },
        })
      ).status,
    ).toBe("NO_SHOW");
  });
});

describe("queue analytics", () => {
  it("summarises throughput, no-show rate, and average wait", async () => {
    const pointId = await newPoint("stats");
    const [u1, u2, u3] = [
      await newUser("s1"),
      await newUser("s2"),
      await newUser("s3"),
    ];
    const base = new Date();
    const minsAgo = (m: number) => new Date(base.getTime() - m * 60_000);

    // Two served (a walk-in waited 10 min, a booking waited 20) + one no-show.
    await prisma.pointQueueEntry.createMany({
      data: [
        {
          pointId,
          userId: u1,
          kind: "DROPOFF",
          status: "DONE",
          serviceDay: serviceDayFor(),
          slotStart: null,
          arrivedAt: minsAgo(10),
          servedAt: base,
        },
        {
          pointId,
          userId: u2,
          kind: "COLLECTION",
          status: "DONE",
          serviceDay: serviceDayFor(),
          slotStart: 540,
          arrivedAt: minsAgo(20),
          servedAt: base,
        },
        {
          pointId,
          userId: u3,
          kind: "DROPOFF",
          status: "NO_SHOW",
          serviceDay: serviceDayFor(),
          slotStart: 600,
        },
      ],
    });

    const s = await queueStats(
      pointId,
      new Date(0),
      new Date(Date.now() + 1000),
    );
    expect(s.total).toBe(3);
    expect(s.served).toBe(2);
    expect(s.noShow).toBe(1);
    expect(s.walkIns).toBe(1);
    expect(s.booked).toBe(2);
    expect(s.avgWaitMin).toBe(15);
    expect(s.noShowRatePct).toBe(33.3);
  });
});

describe("operator new-arrival ping", () => {
  it("notifies the owner on a new arrival, but not on a repeat check-in", async () => {
    const pointId = await newPoint("ping");
    const vUser = await newUser("ping");
    const before = await prisma.notification.count({
      where: { userId: ownerId },
    });

    as(vUser);
    expect(await checkInToPoint({ pointId, kind: "DROPOFF" })).toMatchObject({
      ok: true,
    });
    expect(
      await prisma.notification.count({ where: { userId: ownerId } }),
    ).toBe(before + 1);

    // Idempotent re-check-in (already WAITING) → no second ping.
    await checkInToPoint({ pointId });
    expect(
      await prisma.notification.count({ where: { userId: ownerId } }),
    ).toBe(before + 1);
  });
});
