"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryScope } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { GOVERNORATE_VALUES } from "@/lib/yemen";

type Result = { ok?: boolean; error?: string; conflict?: string[] };

// Create or update a shipping zone. Zones must be disjoint (a governorate
// belongs to at most one zone) so destination → zone resolution is unambiguous.
export async function saveZone(input: {
  id?: string;
  name: string;
  governorates: string[];
}): Promise<Result> {
  const adminId = await requireDeliveryScope("NETWORK");
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const name = input.name.trim();
  if (name.length < 2) return { error: "nameRequired" };
  const validGovs = new Set<string>(GOVERNORATE_VALUES);
  const govs = [...new Set(input.governorates)].filter((g) => validGovs.has(g));
  if (govs.length === 0) return { error: "govRequired" };

  // Reject governorates already claimed by a different zone.
  const others = await prisma.shippingZone.findMany({
    where: input.id ? { id: { not: input.id } } : {},
    select: { governorates: true },
  });
  const taken = new Set(others.flatMap((z) => z.governorates));
  const conflict = govs.filter((g) => taken.has(g));
  if (conflict.length > 0) return { error: "conflict", conflict };

  if (input.id) {
    await prisma.shippingZone.update({
      where: { id: input.id },
      data: { name, governorates: govs },
    });
  } else {
    await prisma.shippingZone.create({ data: { name, governorates: govs } });
  }

  revalidatePath(`/${locale}/admin/shipping-zones`);
  revalidatePath(`/${locale}/delivery-manager/shipping-zones`);
  return { ok: true };
}

// Delete a zone and any store rates attached to it.
export async function deleteZone(id: string): Promise<Result> {
  const adminId = await requireDeliveryScope("NETWORK");
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  await prisma.$transaction([
    prisma.shippingRate.deleteMany({ where: { zoneId: id } }),
    prisma.shippingZone.delete({ where: { id } }),
  ]);

  revalidatePath(`/${locale}/admin/shipping-zones`);
  revalidatePath(`/${locale}/delivery-manager/shipping-zones`);
  return { ok: true };
}
