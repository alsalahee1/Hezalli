"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type WishlistResult = { inWishlist?: boolean; error?: string };

export async function toggleWishlist(
  productId: string,
): Promise<WishlistResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };

  const wishlist = await prisma.wishlist.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id },
    update: {},
    select: { id: true },
  });
  const existing = await prisma.wishlistItem.findUnique({
    where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
    select: { id: true },
  });

  let inWishlist: boolean;
  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    inWishlist = false;
  } else {
    await prisma.wishlistItem.create({
      data: { wishlistId: wishlist.id, productId },
    });
    inWishlist = true;
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/account/wishlist`);
  return { inWishlist };
}
