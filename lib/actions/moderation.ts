"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export type ModResult = { ok?: boolean; error?: string };

// Localized seller notification text (stored on the Notification row, since
// notifications are read later in the seller's own locale — Phase 12).
function notifyText(
  action: "hide" | "remove" | "restore",
  reason: string,
  locale: string,
): { title: string; body: string } {
  const ar = locale === "ar";
  if (action === "restore") {
    return ar
      ? {
          title: "تمت إعادة نشر منتجك",
          body: "راجعت إدارة هزلي منتجك وأعادت نشره.",
        }
      : {
          title: "Your product was restored",
          body: "Hezalli moderation reviewed your product and restored it.",
        };
  }
  const verb =
    action === "remove" ? (ar ? "إزالة" : "removed") : ar ? "إخفاء" : "hidden";
  return ar
    ? {
        title: `تم ${verb} منتجك من قبل إدارة هزلي`,
        body: `السبب: ${reason}. عدّل المنتج ليتوافق مع السياسات ثم تواصل معنا لإعادة نشره.`,
      }
    : {
        title: `Your product was ${verb} by Hezalli moderation`,
        body: `Reason: ${reason}. Update the product to comply, then it can be restored.`,
      };
}

// Post-moderation (DECISIONS §8): admin can hide/remove a live product with a
// reason and notify the seller, or restore a previously moderated one.
export async function moderateProduct(input: {
  productId: string;
  action: "hide" | "remove" | "restore";
  reason?: string;
}): Promise<ModResult> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      slug: true,
      store: {
        select: {
          slug: true,
          seller: { select: { user: { select: { id: true, locale: true } } } },
        },
      },
    },
  });
  if (!product) return { error: "notFound" };

  const reason = (input.reason ?? "").trim();
  const moderating = input.action === "hide" || input.action === "remove";
  if (moderating && reason.length < 3) return { error: "reasonRequired" };

  const status =
    input.action === "hide"
      ? "HIDDEN"
      : input.action === "remove"
        ? "REMOVED"
        : "ACTIVE";

  const sellerUser = product.store.seller.user;
  const text = notifyText(input.action, reason, sellerUser.locale);

  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: {
        status,
        moderatedBy: moderating ? adminId : null,
        moderationReason: moderating ? reason : null,
      },
    }),
    prisma.notification.create({
      data: {
        userId: sellerUser.id,
        type: "SYSTEM",
        title: text.title,
        body: text.body,
        data: { productId: product.id, action: input.action },
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: `product.${input.action}`,
        entity: "Product",
        entityId: product.id,
        meta: reason ? { reason } : undefined,
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/products`);
  // The product's visibility on the storefront changed.
  revalidatePath(`/${locale}/store/${product.store.slug}`);
  return { ok: true };
}
