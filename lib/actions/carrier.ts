"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryScope } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Create or update a shipping carrier. `trackingUrl` is an optional template
// with a `{tracking}` placeholder used to build public tracking links.
export async function saveCarrier(input: {
  id?: string;
  name: string;
  trackingUrl?: string;
  platformManaged?: boolean;
}): Promise<Result> {
  const adminId = await requireDeliveryScope("FLEET");
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const name = input.name.trim();
  if (name.length < 2) return { error: "nameRequired" };
  const trackingUrl = input.trackingUrl?.trim() || null;
  const platformManaged = Boolean(input.platformManaged);

  if (input.id) {
    await prisma.carrier.update({
      where: { id: input.id },
      data: { name, trackingUrl, platformManaged },
    });
  } else {
    await prisma.carrier.create({
      data: { name, trackingUrl, platformManaged },
    });
  }

  revalidatePath(`/${locale}/admin/carriers`);
  revalidatePath(`/${locale}/delivery-manager/carriers`);
  return { ok: true };
}

// Delete a carrier; detach it from any existing shipments first.
export async function deleteCarrier(id: string): Promise<Result> {
  const adminId = await requireDeliveryScope("FLEET");
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  await prisma.$transaction([
    prisma.shipment.updateMany({
      where: { carrierId: id },
      data: { carrierId: null },
    }),
    prisma.carrier.delete({ where: { id } }),
  ]);

  revalidatePath(`/${locale}/admin/carriers`);
  revalidatePath(`/${locale}/delivery-manager/carriers`);
  return { ok: true };
}
