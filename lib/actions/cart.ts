"use server";

import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { getServerCartData, type CartData } from "@/lib/cart";
import type { CartStub } from "@/lib/cart-types";
import { prisma } from "@/lib/prisma";

type CartResult = CartData & { error?: string };

const EMPTY: CartData = { cart: [], saved: [] };

async function ensureCart(userId: string) {
  return prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
}

async function variantInfo(variantId: string) {
  return prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      stock: true,
      isActive: true,
      product: { select: { storeId: true, status: true } },
    },
  });
}

export async function addToCart(
  variantId: string,
  quantity = 1,
): Promise<CartResult> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { ...EMPTY, error: "unauthorized" };

  const v = await variantInfo(variantId);
  if (!v || !v.isActive || v.product.status !== "ACTIVE") {
    return {
      ...(await getServerCartData(session.user.id, locale)),
      error: "unavailable",
    };
  }
  const cart = await ensureCart(session.user.id);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    select: { quantity: true, savedForLater: true },
  });
  // Adding always lands the item in the active cart.
  const base = existing && !existing.savedForLater ? existing.quantity : 0;
  const desired = Math.min(v.stock, base + Math.max(1, quantity));
  if (desired <= 0) {
    return {
      ...(await getServerCartData(session.user.id, locale)),
      error: "outOfStock",
    };
  }
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: {
      cartId: cart.id,
      variantId,
      storeId: v.product.storeId,
      quantity: desired,
    },
    update: { quantity: desired, savedForLater: false },
  });
  return getServerCartData(session.user.id, locale);
}

export async function setCartQty(
  variantId: string,
  quantity: number,
): Promise<CartResult> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return EMPTY;
  const cart = await prisma.cart.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!cart) return EMPTY;

  if (quantity <= 0) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
  } else {
    const v = await variantInfo(variantId);
    const q = Math.min(quantity, v?.stock ?? quantity);
    await prisma.cartItem.updateMany({
      where: { cartId: cart.id, variantId },
      data: { quantity: q },
    });
  }
  return getServerCartData(session.user.id, locale);
}

export async function removeFromCart(variantId: string): Promise<CartResult> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return EMPTY;
  const cart = await prisma.cart.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (cart) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
  }
  return getServerCartData(session.user.id, locale);
}

export async function saveForLater(variantId: string): Promise<CartResult> {
  return setSaved(variantId, true);
}
export async function moveToCart(variantId: string): Promise<CartResult> {
  return setSaved(variantId, false);
}

async function setSaved(
  variantId: string,
  savedForLater: boolean,
): Promise<CartResult> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return EMPTY;
  const cart = await prisma.cart.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (cart) {
    await prisma.cartItem.updateMany({
      where: { cartId: cart.id, variantId },
      data: { savedForLater },
    });
  }
  return getServerCartData(session.user.id, locale);
}

// Merge a guest's localStorage cart into the account cart on login.
export async function mergeGuestCart(
  active: CartStub[],
  saved: CartStub[] = [],
): Promise<CartResult> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return EMPTY;

  const all = [
    ...active.map((i) => ({ ...i, savedForLater: false })),
    ...saved.map((i) => ({ ...i, savedForLater: true })),
  ];
  if (all.length > 0) {
    const cart = await ensureCart(session.user.id);
    const ids = all.map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: ids }, isActive: true, product: { status: "ACTIVE" } },
      select: { id: true, stock: true, product: { select: { storeId: true } } },
    });
    const vById = new Map(variants.map((v) => [v.id, v]));
    const existing = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
      select: { variantId: true, quantity: true },
    });
    const exByVar = new Map(existing.map((e) => [e.variantId, e.quantity]));

    for (const it of all) {
      const v = vById.get(it.variantId);
      if (!v) continue;
      const merged = Math.min(
        v.stock,
        (exByVar.get(it.variantId) ?? 0) + Math.max(1, it.quantity),
      );
      if (merged <= 0) continue;
      await prisma.cartItem.upsert({
        where: {
          cartId_variantId: { cartId: cart.id, variantId: it.variantId },
        },
        create: {
          cartId: cart.id,
          variantId: it.variantId,
          storeId: v.product.storeId,
          quantity: merged,
          savedForLater: it.savedForLater,
        },
        update: { quantity: merged },
      });
    }
  }
  return getServerCartData(session.user.id, locale);
}
