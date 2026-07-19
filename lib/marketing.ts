// Abandoned-cart re-engagement (Step 17.8): nudge shoppers who left active
// items in their cart. Best-effort and idempotent per cart — the remindedAt
// guard means a cart is nudged at most once. In-app is always delivered; email
// honours each user's PROMO toggle via notify().
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

const HOUR_MS = 3_600_000;

// Localized copy (server-side, outside a request locale — mirrors lib/alerts).
const COPY = {
  en: {
    title: "You left something in your cart",
    body: "Your items are still waiting — check out before they sell out.",
  },
  ar: {
    title: "لديك منتجات في سلتك",
    body: "منتجاتك ما زالت بانتظارك — أكمل طلبك قبل نفادها.",
  },
};

export async function remindAbandonedCarts(opts?: {
  olderThanHours?: number;
  withinDays?: number;
  limit?: number;
}): Promise<number> {
  const olderThanHours = opts?.olderThanHours ?? 4;
  const withinDays = opts?.withinDays ?? 7;
  const limit = opts?.limit ?? 200;
  const now = Date.now();
  const staleBefore = new Date(now - olderThanHours * HOUR_MS);
  const floor = new Date(now - withinDays * 24 * HOUR_MS);

  const carts = await prisma.cart.findMany({
    where: {
      remindedAt: null,
      updatedAt: { lte: staleBefore, gte: floor },
      items: { some: { savedForLater: false } },
      user: { isSuspended: false, deletedAt: null },
    },
    select: {
      id: true,
      user: { select: { id: true, locale: true } },
      items: { where: { savedForLater: false }, select: { quantity: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let sent = 0;
  for (const cart of carts) {
    const units = cart.items.reduce((s, i) => s + i.quantity, 0);
    if (units === 0) continue;
    const copy = cart.user.locale === "ar" ? COPY.ar : COPY.en;
    await notify({
      userId: cart.user.id,
      type: "PROMO",
      title: copy.title,
      body: copy.body,
      link: "/cart",
    });
    await prisma.cart.update({
      where: { id: cart.id },
      data: { remindedAt: new Date() },
    });
    sent++;
  }
  return sent;
}
