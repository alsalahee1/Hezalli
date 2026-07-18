// Marketing re-engagement alerts (Step 17.8): notify everyone who has a product
// in their wishlist when it comes back in stock or drops in price. In-app
// notifications are always delivered; email honours each user's category
// toggles (via notify() → the PROMO category). Best-effort — callers wrap this
// so a failure never blocks the underlying inventory update.
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

export type WishlistAlertKind = "restock" | "priceDrop";

export async function notifyWishlistWatchers(
  productId: string,
  kind: WishlistAlertKind,
): Promise<number> {
  const product = await prisma.product.findFirst({
    // Only alert for live products from active stores.
    where: { id: productId, status: "ACTIVE", store: { status: "ACTIVE" } },
    select: {
      slug: true,
      title: true,
      store: { select: { seller: { select: { userId: true } } } },
    },
  });
  if (!product) return 0;
  const sellerUserId = product.store.seller.userId;

  const watchers = await prisma.wishlistItem.findMany({
    where: { productId },
    select: { wishlist: { select: { userId: true } } },
  });
  const userIds = [...new Set(watchers.map((w) => w.wishlist.userId))].filter(
    (id) => id !== sellerUserId,
  );
  if (userIds.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isSuspended: false, deletedAt: null },
    select: { id: true, locale: true },
  });
  const title = (product.title ?? {}) as { en?: string; ar?: string };
  const link = `/product/${product.slug}`;

  for (const u of users) {
    const ar = u.locale === "ar";
    const name = (ar ? title.ar : title.en) || title.en || title.ar || "";
    const heading =
      kind === "restock"
        ? ar
          ? "عاد للتوفر"
          : "Back in stock"
        : ar
          ? "انخفض السعر"
          : "Price drop";
    const body =
      kind === "restock"
        ? ar
          ? `${name} في قائمة أمنياتك عاد للتوفر.`
          : `${name} from your wishlist is back in stock.`
        : ar
          ? `انخفض سعر ${name} في قائمة أمنياتك.`
          : `The price of ${name} in your wishlist just dropped.`;
    await notify({
      userId: u.id,
      type: "PROMO",
      title: heading,
      body,
      link,
      data: { productId },
    });
  }
  return users.length;
}
