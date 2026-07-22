// Flash-sale pricing. A variant sells at its flash price only while the sale is
// live and flash stock remains; otherwise the normal price applies. Flash stock
// is tracked on FlashSaleItem.soldCount and decremented atomically at checkout.
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Release the flash stock a cancelled/expired order claimed at checkout, so a
// live sale doesn't show sold-out while the units are back in real stock.
// Conditional decrement (never below 0); a deleted flash item is a no-op.
export async function releaseFlashClaims(
  tx: Prisma.TransactionClient,
  items: { flashItemId: string | null; quantity: number }[],
): Promise<void> {
  for (const it of items) {
    if (!it.flashItemId || it.quantity <= 0) continue;
    await tx.flashSaleItem.updateMany({
      where: { id: it.flashItemId, soldCount: { gte: it.quantity } },
      data: { soldCount: { decrement: it.quantity } },
    });
  }
}

export type FlashInfo = {
  itemId: string;
  salePrice: number;
  stockLimit: number | null;
  soldCount: number;
  remaining: number | null; // null = unlimited
  endsAt: Date;
};

// Active flash pricing for a set of variants (live sales with stock left).
export async function getFlashPricesFor(
  variantIds: string[],
): Promise<Map<string, FlashInfo>> {
  const out = new Map<string, FlashInfo>();
  if (variantIds.length === 0) return out;
  const now = new Date();
  const items = await prisma.flashSaleItem.findMany({
    where: {
      variantId: { in: variantIds },
      flashSale: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    },
    select: {
      id: true,
      variantId: true,
      salePrice: true,
      stockLimit: true,
      soldCount: true,
      flashSale: { select: { endsAt: true } },
    },
  });
  for (const it of items) {
    const remaining =
      it.stockLimit == null ? null : Math.max(0, it.stockLimit - it.soldCount);
    if (remaining !== null && remaining <= 0) continue; // sold out → normal price
    const salePrice = Number(it.salePrice);
    const existing = out.get(it.variantId);
    if (!existing || salePrice < existing.salePrice) {
      out.set(it.variantId, {
        itemId: it.id,
        salePrice,
        stockLimit: it.stockLimit,
        soldCount: it.soldCount,
        remaining,
        endsAt: it.flashSale.endsAt,
      });
    }
  }
  return out;
}

export async function getFlashPrice(
  variantId: string,
): Promise<FlashInfo | null> {
  return (await getFlashPricesFor([variantId])).get(variantId) ?? null;
}

// Live + upcoming sales with their product cards, for the home strip and the
// /flash-sale page.
export async function getFlashSales(when: "live" | "upcoming") {
  const now = new Date();
  const where =
    when === "live"
      ? { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } }
      : { isActive: true, startsAt: { gt: now } };
  return prisma.flashSale.findMany({
    where,
    orderBy: when === "live" ? { endsAt: "asc" } : { startsAt: "asc" },
    take: 5,
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      items: {
        select: {
          id: true,
          salePrice: true,
          stockLimit: true,
          soldCount: true,
          variant: {
            select: {
              id: true,
              price: true,
              product: {
                select: {
                  slug: true,
                  title: true,
                  images: {
                    orderBy: { position: "asc" },
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
