"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId, requireSellerStore } from "@/lib/authz";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Seller schedules a % discount across a product's variants for a date range.
export async function scheduleProductDiscount(input: {
  productId: string;
  percentOff: number;
  startsAt: string;
  endsAt: string;
}): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const pct = Math.round(input.percentOff);
  if (!(pct > 0 && pct <= 90)) return { error: "badPercent" };
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: "badDates" };
  }
  if (endsAt <= startsAt) return { error: "badWindow" };

  const product = await prisma.product.findFirst({
    where: { id: input.productId, storeId: gate.storeId },
    select: {
      id: true,
      slug: true,
      variants: { select: { id: true, price: true, compareAtPrice: true } },
    },
  });
  if (!product) return { error: "notFound" };

  for (const v of product.variants) {
    const was = Number(v.compareAtPrice ?? v.price);
    const sale = round2(was * (1 - pct / 100));
    await prisma.productVariant.update({
      where: { id: v.id },
      data: {
        price: sale,
        compareAtPrice: was,
        saleStartsAt: startsAt,
        saleEndsAt: endsAt,
      },
    });
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/products`);
  revalidatePath(`/${locale}/product/${product.slug}`);
  return { ok: true };
}

export async function clearProductDiscount(productId: string): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId: gate.storeId },
    select: {
      slug: true,
      variants: { select: { id: true, price: true, compareAtPrice: true } },
    },
  });
  if (!product) return { error: "notFound" };
  for (const v of product.variants) {
    if (v.compareAtPrice == null) continue;
    await prisma.productVariant.update({
      where: { id: v.id },
      data: {
        price: v.compareAtPrice,
        compareAtPrice: null,
        saleStartsAt: null,
        saleEndsAt: null,
      },
    });
  }
  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/products`);
  revalidatePath(`/${locale}/product/${product.slug}`);
  return { ok: true };
}

export async function setProductFeatured(
  productId: string,
  isFeatured: boolean,
): Promise<Result> {
  if (!(await requireAdminId())) return { error: "forbidden" };
  await prisma.product.update({
    where: { id: productId },
    data: { isFeatured },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/products`);
  return { ok: true };
}

export async function setStoreFeatured(
  storeId: string,
  isFeatured: boolean,
): Promise<Result> {
  if (!(await requireAdminId())) return { error: "forbidden" };
  await prisma.store.update({ where: { id: storeId }, data: { isFeatured } });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/sellers`);
  return { ok: true };
}

// Buyer follows / unfollows a store. Returns the new state + count.
export async function toggleFollow(
  storeId: string,
): Promise<{ following?: boolean; count?: number; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;
  const existing = await prisma.storeFollow.findUnique({
    where: { userId_storeId: { userId, storeId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.storeFollow.delete({ where: { id: existing.id } });
  } else {
    await prisma.storeFollow.create({ data: { userId, storeId } });
  }
  const count = await prisma.storeFollow.count({ where: { storeId } });
  return { following: !existing, count };
}

// Seller sends a store voucher to all followers (simple version): creates the
// coupon and notifies each follower in-app.
export async function sendVoucherToFollowers(input: {
  code: string;
  percentOff: number;
  days: number;
}): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return { error: "badCode" };
  const pct = Math.round(input.percentOff);
  if (!(pct > 0 && pct <= 90)) return { error: "badPercent" };

  const clash = await prisma.coupon.findUnique({
    where: { code },
    select: { id: true },
  });
  if (clash) return { error: "codeTaken" };

  await prisma.coupon.create({
    data: {
      code,
      scope: "SELLER",
      storeId: gate.storeId,
      discountType: "PERCENT",
      value: pct,
      endsAt: new Date(Date.now() + Math.max(1, input.days) * 86_400_000),
      isActive: true,
    },
  });

  const store = await prisma.store.findUnique({
    where: { id: gate.storeId },
    select: { name: true, followers: { select: { userId: true } } },
  });
  if (store && store.followers.length > 0) {
    await prisma.notification.createMany({
      data: store.followers.map((f) => ({
        userId: f.userId,
        type: "PROMO" as const,
        title: `${store.name}: ${pct}% off`,
        body: `Use code ${code} for ${pct}% off at ${store.name}.`,
        data: {},
      })),
    });
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/promotions`);
  return { ok: true };
}
