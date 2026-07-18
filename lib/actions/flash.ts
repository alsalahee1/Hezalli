"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

async function revalidate() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/flash-sales`);
  revalidatePath(`/${locale}/flash-sale`);
}

export async function createFlashSale(input: {
  nameEn: string;
  nameAr: string;
  startsAt: string;
  endsAt: string;
}): Promise<Result> {
  if (!(await requireAdminId())) return { error: "forbidden" };
  const nameEn = input.nameEn.trim();
  const nameAr = input.nameAr.trim();
  if (nameEn.length < 2) return { error: "nameRequired" };
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: "badDates" };
  }
  if (endsAt <= startsAt) return { error: "badWindow" };

  await prisma.flashSale.create({
    data: { name: { en: nameEn, ar: nameAr || nameEn }, startsAt, endsAt },
  });
  await revalidate();
  return { ok: true };
}

export async function deleteFlashSale(id: string): Promise<Result> {
  if (!(await requireAdminId())) return { error: "forbidden" };
  await prisma.flashSale.delete({ where: { id } });
  await revalidate();
  return { ok: true };
}

export async function addFlashItem(input: {
  flashSaleId: string;
  variantId: string;
  salePrice: number;
  stockLimit: number | null;
}): Promise<Result> {
  if (!(await requireAdminId())) return { error: "forbidden" };
  if (!(input.salePrice > 0)) return { error: "badPrice" };

  const variant = await prisma.productVariant.findUnique({
    where: { id: input.variantId },
    select: { id: true },
  });
  if (!variant) return { error: "notFound" };

  const dupe = await prisma.flashSaleItem.findFirst({
    where: { flashSaleId: input.flashSaleId, variantId: input.variantId },
    select: { id: true },
  });
  if (dupe) return { error: "duplicate" };

  await prisma.flashSaleItem.create({
    data: {
      flashSaleId: input.flashSaleId,
      variantId: input.variantId,
      salePrice: round2(input.salePrice),
      stockLimit:
        input.stockLimit != null && input.stockLimit > 0
          ? Math.floor(input.stockLimit)
          : null,
    },
  });
  await revalidate();
  return { ok: true };
}

export async function removeFlashItem(id: string): Promise<Result> {
  if (!(await requireAdminId())) return { error: "forbidden" };
  await prisma.flashSaleItem.delete({ where: { id } });
  await revalidate();
  return { ok: true };
}
