"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryManagerId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string; fleetId?: string };

function clean(s: string | undefined | null, max: number): string | null {
  const v = (s ?? "").trim().slice(0, max);
  return v.length ? v : null;
}

async function revalidateFleet(fleetId?: string) {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/fleets`);
  if (fleetId) revalidatePath(`/${locale}/admin/fleets/${fleetId}`);
  revalidatePath(`/${locale}/fleet`);
}

// Create a fleet-partner. Admin only.
export async function createFleet(input: {
  name: string;
  contactPhone?: string;
  contactEmail?: string;
}): Promise<Result> {
  const adminId = await requireDeliveryManagerId();
  if (!adminId) return { error: "forbidden" };
  const name = clean(input.name, 80);
  if (!name) return { error: "nameRequired" };
  const fleet = await prisma.fleet.create({
    data: {
      name,
      contactPhone: clean(input.contactPhone, 40),
      contactEmail: clean(input.contactEmail, 120),
    },
    select: { id: true },
  });
  await revalidateFleet(fleet.id);
  return { ok: true, fleetId: fleet.id };
}

// Edit a fleet's profile / active state. Admin only.
export async function updateFleet(input: {
  fleetId: string;
  name: string;
  contactPhone?: string;
  contactEmail?: string;
  isActive: boolean;
}): Promise<Result> {
  const adminId = await requireDeliveryManagerId();
  if (!adminId) return { error: "forbidden" };
  const name = clean(input.name, 80);
  if (!name) return { error: "nameRequired" };
  const fleet = await prisma.fleet.findUnique({
    where: { id: input.fleetId },
    select: { id: true },
  });
  if (!fleet) return { error: "notFound" };
  await prisma.fleet.update({
    where: { id: input.fleetId },
    data: {
      name,
      contactPhone: clean(input.contactPhone, 40),
      contactEmail: clean(input.contactEmail, 120),
      isActive: Boolean(input.isActive),
    },
  });
  await revalidateFleet(input.fleetId);
  return { ok: true };
}

// Add a courier to a fleet (or move them from another). The user must hold the
// COURIER role. Admin only.
export async function assignCourierToFleet(input: {
  fleetId: string;
  courierId: string;
}): Promise<Result> {
  const adminId = await requireDeliveryManagerId();
  if (!adminId) return { error: "forbidden" };
  const [fleet, courier] = await Promise.all([
    prisma.fleet.findUnique({
      where: { id: input.fleetId },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: input.courierId },
      select: { id: true, roles: true },
    }),
  ]);
  if (!fleet) return { error: "notFound" };
  if (!courier || !courier.roles.includes("COURIER"))
    return { error: "notCourier" };
  await prisma.user.update({
    where: { id: input.courierId },
    data: { fleetId: input.fleetId },
  });
  await revalidateFleet(input.fleetId);
  return { ok: true };
}

// Remove a courier from their fleet. If they were the fleet's owner, the
// ownership is cleared too. Admin only.
export async function removeCourierFromFleet(input: {
  courierId: string;
}): Promise<Result> {
  const adminId = await requireDeliveryManagerId();
  if (!adminId) return { error: "forbidden" };
  const courier = await prisma.user.findUnique({
    where: { id: input.courierId },
    select: { id: true, fleetId: true, ownedFleet: { select: { id: true } } },
  });
  if (!courier || !courier.fleetId) return { error: "notFound" };
  const fleetId = courier.fleetId;
  await prisma.$transaction(async (tx) => {
    // Clear ownership first if this driver led the same fleet they're leaving.
    if (courier.ownedFleet && courier.ownedFleet.id === fleetId) {
      await tx.fleet.update({
        where: { id: fleetId },
        data: { ownerId: null },
      });
    }
    await tx.user.update({
      where: { id: input.courierId },
      data: { fleetId: null },
    });
  });
  await revalidateFleet(fleetId);
  return { ok: true };
}

// Set (or clear) the fleet's owner — the partner user who gets the read-only
// fleet portal. The owner must be a courier currently in this fleet. Admin only.
export async function setFleetOwner(input: {
  fleetId: string;
  courierId: string | null;
}): Promise<Result> {
  const adminId = await requireDeliveryManagerId();
  if (!adminId) return { error: "forbidden" };
  const fleet = await prisma.fleet.findUnique({
    where: { id: input.fleetId },
    select: { id: true },
  });
  if (!fleet) return { error: "notFound" };

  if (input.courierId) {
    const courier = await prisma.user.findUnique({
      where: { id: input.courierId },
      select: { id: true, fleetId: true },
    });
    if (!courier || courier.fleetId !== input.fleetId)
      return { error: "notMember" };
  }
  // ownerId is unique — a user owning another fleet can't be reused. Prisma
  // rejects the duplicate; surface it as a friendly error.
  try {
    await prisma.fleet.update({
      where: { id: input.fleetId },
      data: { ownerId: input.courierId },
    });
  } catch {
    return { error: "ownerTaken" };
  }
  await revalidateFleet(input.fleetId);
  return { ok: true };
}
