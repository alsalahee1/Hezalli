// Arrival-queue refinements (docs §45): per-hub slot capacity override + the
// approaching-slot reminder sweep. Runs against local Postgres.
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

import { setPointSlotCapacity } from "@/lib/actions/point";
import { bookPointSlot } from "@/lib/actions/point-queue";
import { sweepQueueReminders } from "@/lib/point-queue-sweep";
import { minutesNowAden, serviceDayFor } from "@/lib/point-queue";
import { prisma } from "@/lib/prisma";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

const ALL_DAY = Array.from({ length: 7 }, () => ({
  open: "00:00",
  close: "00:00",
}));

let ownerId: string;
let pointId: string;
const visitors: string[] = [];
const currentSlot = Math.floor(minutesNowAden() / 30) * 30;

async function newUser(tag: string): Promise<string> {
  const u = await prisma.user.create({
    data: {
      email: `pqr-${tag}-${Date.now().toString(36)}-${Math.floor(
        performance.now(),
      )}@t.local`,
      locale: "en",
    },
  });
  return u.id;
}

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: { email: `pqr-own-${uniq}@t.local`, roles: ["DELIVERY_POINT"] },
  });
  ownerId = owner.id;
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId,
      name: `Refine Point ${uniq}`,
      phone: "770000055",
      governorate: `RefineGov-${uniq}`,
      city: "Aden",
      addressLine: "Refine st",
      openingHours: ALL_DAY,
    },
  });
  pointId = point.id;
  for (const tag of ["a", "b", "c", "d", "e", "f"]) {
    visitors.push(await newUser(tag));
  }
});

afterAll(async () => {
  await prisma.platformSetting
    .deleteMany({ where: { key: "queue_reminder_minutes" } })
    .catch(() => {});
  await prisma.pointQueueEntry
    .deleteMany({ where: { pointId } })
    .catch(() => {});
  const everyone = [ownerId, ...visitors];
  await prisma.notification
    .deleteMany({ where: { userId: { in: everyone } } })
    .catch(() => {});
  await prisma.auditLog
    .deleteMany({ where: { actorId: ownerId } })
    .catch(() => {});
  await prisma.deliveryPoint.delete({ where: { id: pointId } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: everyone } } })
    .catch(() => {});
});

describe("per-hub slot capacity", () => {
  it("overrides the platform default, then falls back when cleared", async () => {
    const [vA, vB, vC] = visitors;

    // Owner caps this hub's slots at 1.
    as(ownerId);
    expect(await setPointSlotCapacity(1)).toEqual({ ok: true });
    expect(
      (
        await prisma.deliveryPoint.findUniqueOrThrow({
          where: { id: pointId },
          select: { slotCapacity: true },
        })
      ).slotCapacity,
    ).toBe(1);

    // One booking fills the slot; the next visitor is turned away.
    as(vA);
    expect(
      await bookPointSlot({ pointId, kind: "DROPOFF", slotStart: currentSlot }),
    ).toEqual({ ok: true });
    as(vB);
    expect(
      await bookPointSlot({ pointId, kind: "DROPOFF", slotStart: currentSlot }),
    ).toEqual({ error: "slotFull" });

    // Clear the override → the hub falls back to the platform default (4),
    // so the same slot now accepts more.
    as(ownerId);
    expect(await setPointSlotCapacity(null)).toEqual({ ok: true });
    as(vB);
    expect(
      await bookPointSlot({ pointId, kind: "DROPOFF", slotStart: currentSlot }),
    ).toEqual({ ok: true });

    // Gating: a non-operator can't set it; bad values are rejected.
    as(vC);
    expect(await setPointSlotCapacity(2)).toEqual({ error: "forbidden" });
    as(ownerId);
    expect(await setPointSlotCapacity(500)).toEqual({ error: "badInput" });
  });
});

describe("approaching-slot reminder sweep", () => {
  it("nudges a near booking once, skips far ones, and honours the off switch", async () => {
    const [, , , vD, vE, vF] = visitors;
    const serviceDay = serviceDayFor();
    const nowMin = minutesNowAden();
    // A slot outside the reminder window (either 2h ahead, or — near midnight —
    // 2h behind; both are excluded).
    const farSlot = nowMin + 120 <= 1439 ? nowMin + 120 : nowMin - 120;

    const dueId = (
      await prisma.pointQueueEntry.create({
        data: {
          pointId,
          userId: vD,
          kind: "DROPOFF",
          status: "BOOKED",
          serviceDay,
          slotStart: nowMin,
          bookedAt: new Date(),
        },
      })
    ).id;
    await prisma.pointQueueEntry.create({
      data: {
        pointId,
        userId: vE,
        kind: "DROPOFF",
        status: "BOOKED",
        serviceDay,
        slotStart: farSlot,
        bookedAt: new Date(),
      },
    });

    // Reminder horizon of 60 min: the now-slot is due, the far one isn't.
    await prisma.platformSetting.upsert({
      where: { key: "queue_reminder_minutes" },
      create: { key: "queue_reminder_minutes", value: "60" },
      update: { value: "60" },
    });

    const first = await sweepQueueReminders();
    expect(first.reminded).toBeGreaterThanOrEqual(1);
    // Due booking got stamped + notified; far booking untouched.
    expect(
      (
        await prisma.pointQueueEntry.findUniqueOrThrow({
          where: { id: dueId },
          select: { remindedAt: true },
        })
      ).remindedAt,
    ).toBeTruthy();
    const vdNotifs = await prisma.notification.count({ where: { userId: vD } });
    expect(vdNotifs).toBe(1);
    expect(await prisma.notification.count({ where: { userId: vE } })).toBe(0);

    // Second sweep is a no-op for the already-reminded booking.
    await sweepQueueReminders();
    expect(await prisma.notification.count({ where: { userId: vD } })).toBe(
      vdNotifs,
    );

    // Off switch: with the horizon at 0, a fresh near booking is never nudged.
    await prisma.platformSetting.update({
      where: { key: "queue_reminder_minutes" },
      data: { value: "0" },
    });
    await prisma.pointQueueEntry.create({
      data: {
        pointId,
        userId: vF,
        kind: "DROPOFF",
        status: "BOOKED",
        serviceDay,
        slotStart: nowMin,
        bookedAt: new Date(),
      },
    });
    expect((await sweepQueueReminders()).reminded).toBe(0);
    expect(await prisma.notification.count({ where: { userId: vF } })).toBe(0);
  });
});
