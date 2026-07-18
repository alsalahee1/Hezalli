"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId, requireSellerStore } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { recomputeProductRating } from "@/lib/reviews";

type Result = { ok?: boolean; error?: string };

const EDIT_WINDOW_MS = 30 * 86_400_000; // 30 days

async function revalidateProduct(productId: string) {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  if (p) {
    const locale = await getLocale();
    revalidatePath(`/${locale}/product/${p.slug}`);
  }
}

// Buyer reviews a purchased product from a COMPLETED sub-order. Verified by
// construction — only real, completed purchases can be reviewed.
export async function createReview(input: {
  productId: string;
  subOrderId: string;
  rating: number;
  comment?: string;
  images?: string[];
}): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) return { error: "ratingRequired" };
  const images = (input.images ?? []).filter(Boolean).slice(0, 5);

  const variantIds = (
    await prisma.productVariant.findMany({
      where: { productId: input.productId },
      select: { id: true },
    })
  ).map((v) => v.id);

  const sub = await prisma.subOrder.findFirst({
    where: {
      id: input.subOrderId,
      status: "COMPLETED",
      order: { buyerId: userId },
      items: { some: { variantId: { in: variantIds } } },
    },
    select: {
      id: true,
      store: {
        select: {
          seller: {
            select: { user: { select: { id: true, locale: true } } },
          },
        },
      },
    },
  });
  if (!sub) return { error: "notEligible" };

  const existing = await prisma.review.findFirst({
    where: {
      subOrderId: input.subOrderId,
      productId: input.productId,
      buyerId: userId,
    },
    select: { id: true },
  });
  if (existing) return { error: "alreadyReviewed" };

  await prisma.review.create({
    data: {
      productId: input.productId,
      subOrderId: input.subOrderId,
      buyerId: userId,
      rating,
      comment: input.comment?.trim() || null,
      images: images.length
        ? { create: images.map((url) => ({ url })) }
        : undefined,
    },
  });
  await recomputeProductRating(input.productId);

  const seller = sub.store.seller.user;
  const ar = seller.locale === "ar";
  await prisma.notification.create({
    data: {
      userId: seller.id,
      type: "SYSTEM",
      title: ar ? "مراجعة جديدة" : "New review",
      body: ar
        ? `حصل أحد منتجاتك على تقييم ${rating}/5.`
        : `One of your products received a ${rating}/5 review.`,
      data: { productId: input.productId },
    },
  });

  await revalidateProduct(input.productId);
  return { ok: true };
}

// Buyer edits their own review within the 30-day window.
export async function updateReview(input: {
  reviewId: string;
  rating: number;
  comment?: string;
  images?: string[];
}): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };

  const review = await prisma.review.findFirst({
    where: { id: input.reviewId, buyerId: session.user.id },
    select: { id: true, productId: true, createdAt: true },
  });
  if (!review) return { error: "notFound" };
  if (Date.now() - review.createdAt.getTime() > EDIT_WINDOW_MS) {
    return { error: "editWindowClosed" };
  }
  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) return { error: "ratingRequired" };
  const images = (input.images ?? []).filter(Boolean).slice(0, 5);

  await prisma.$transaction([
    prisma.reviewImage.deleteMany({ where: { reviewId: review.id } }),
    prisma.review.update({
      where: { id: review.id },
      data: {
        rating,
        comment: input.comment?.trim() || null,
        images: images.length
          ? { create: images.map((url) => ({ url })) }
          : undefined,
      },
    }),
  ]);
  await recomputeProductRating(review.productId);
  await revalidateProduct(review.productId);
  return { ok: true };
}

// Seller posts one public reply to a review on their product.
export async function replyToReview(
  reviewId: string,
  reply: string,
): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };

  const review = await prisma.review.findFirst({
    where: { id: reviewId, product: { storeId: gate.storeId } },
    select: { id: true, buyerId: true, productId: true },
  });
  if (!review) return { error: "notFound" };
  const text = reply.trim();
  if (text.length < 2) return { error: "replyRequired" };

  await prisma.review.update({
    where: { id: review.id },
    data: { storeReply: text },
  });
  await prisma.notification.create({
    data: {
      userId: review.buyerId,
      type: "SYSTEM",
      title: "Seller replied to your review",
      body: text.slice(0, 140),
      data: { productId: review.productId },
    },
  });
  await revalidateProduct(review.productId);
  return { ok: true };
}

// Anyone signed in can report a review for moderation (feeds admin queue).
export async function reportReview(reviewId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true },
  });
  if (!review) return { error: "notFound" };

  const admins = await prisma.user.findMany({
    where: { roles: { has: "ADMIN" }, isSuspended: false },
    select: { id: true, locale: true },
  });
  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "SYSTEM" as const,
        title: a.locale === "ar" ? "بلاغ عن مراجعة" : "Review reported",
        body:
          a.locale === "ar"
            ? "أبلغ مستخدم عن مراجعة للمراجعة."
            : "A user reported a review for moderation.",
        data: { reviewId },
      })),
    });
  }
  return { ok: true };
}

// Admin hides/unhides a review; rating recomputes to exclude/include it.
export async function setReviewHidden(
  reviewId: string,
  hidden: boolean,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const review = await prisma.review.update({
    where: { id: reviewId },
    data: { hidden },
    select: { productId: true },
  });
  await recomputeProductRating(review.productId);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/reviews`);
  await revalidateProduct(review.productId);
  return { ok: true };
}
