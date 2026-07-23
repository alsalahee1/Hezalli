import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Store as StoreIcon, Zap } from "lucide-react";

import { auth } from "@/auth";
import { localizedName } from "@/lib/categories";
import { getFlashPricesFor } from "@/lib/flash";
import { effectivePrice } from "@/lib/pricing";
import { toCardItem } from "@/lib/products";
import { prisma } from "@/lib/prisma";
import { coPurchasedProductIds } from "@/lib/recommendations";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ChatLauncher } from "@/components/chat/chat-launcher";
import { Countdown } from "@/components/promotions/countdown";
import { ProductCard } from "@/components/product/product-card";
import { ProductGallery } from "@/components/product/product-gallery";
import { RecordView } from "@/components/product/record-view";
import { ProductShare } from "@/components/product/product-share";
import { ProductTabs, type Spec } from "@/components/product/product-tabs";
import { ProductReviews } from "@/components/product/product-reviews";
import { JsonLd } from "@/components/seo/json-ld";
import { type ReviewDraft } from "@/components/product/review-form";
import { StarRating } from "@/components/product/star-rating";
import {
  VariantPicker,
  type PickerVariant,
} from "@/components/product/variant-picker";

async function getProduct(slug: string) {
  return prisma.product.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      store: { status: "ACTIVE", isOnVacation: false },
    },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { where: { isActive: true }, orderBy: { sku: "asc" } },
      brand: { select: { name: true, slug: true } },
      category: { select: { name: true, slug: true, defaultSizeClass: true } },
      store: {
        select: {
          name: true,
          slug: true,
          logo: true,
          ratingAvg: true,
          ratingCount: true,
          policies: true,
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const product = await prisma.product.findFirst({
    where: { slug, status: "ACTIVE" },
    select: { title: true, description: true, images: { take: 1 } },
  });
  if (!product) return {};
  const title = localizedName(product.title, locale);
  const description = localizedName(product.description, locale).slice(0, 160);
  return {
    title: `${title} — Hezalli`,
    description,
    openGraph: { title, description, images: product.images.map((i) => i.url) },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rsort?: string; rpage?: string }>;
}) {
  const { slug } = await params;
  const { rsort, rpage } = await searchParams;
  const product = await getProduct(slug);
  if (!product) notFound();

  // Bump the lifetime view counter that powers the seller analytics traffic /
  // conversion metrics (Step 17.7). Fire-and-forget so analytics never blocks
  // or breaks the page; a batched/queued counter can replace this at scale
  // (Step 17.10).
  void prisma.product
    .update({ where: { id: product.id }, data: { views: { increment: 1 } } })
    .catch(() => {});

  // Track recently-viewed for signed-in users (guests are tracked client-side).
  const session = await auth();
  const sessionUserId = session?.user?.id;
  // A signed JWT can outlive the user it names — e.g. the account was deleted
  // or the database was reseeded while the browser kept its login cookie.
  // Confirm the user still exists before running any personalized query;
  // otherwise the RecentlyViewed insert below references a missing userId and
  // hits a foreign-key violation that 500s the whole page.
  const userId = sessionUserId
    ? (
        await prisma.user.findUnique({
          where: { id: sessionUserId },
          select: { id: true },
        })
      )?.id
    : undefined;
  let inWishlist = false;
  let canReview = false;
  let reviewSubOrderId: string | undefined;
  let myReview: ReviewDraft | null = null;
  let isStoreOwner = false;
  if (userId) {
    await prisma.recentlyViewed.upsert({
      where: {
        userId_productId: { userId, productId: product.id },
      },
      create: { userId, productId: product.id },
      update: { viewedAt: new Date() },
    });
    const w = await prisma.wishlistItem.findFirst({
      where: { productId: product.id, wishlist: { userId } },
      select: { id: true },
    });
    inWishlist = Boolean(w);

    // Review eligibility: a COMPLETED purchase of this product not yet reviewed.
    const allVariantIds = (
      await prisma.productVariant.findMany({
        where: { productId: product.id },
        select: { id: true },
      })
    ).map((v) => v.id);
    const [existingReview, reviewedSubs, ownStore] = await Promise.all([
      prisma.review.findFirst({
        where: { productId: product.id, buyerId: userId },
        include: { images: true },
      }),
      prisma.review.findMany({
        where: { productId: product.id, buyerId: userId },
        select: { subOrderId: true },
      }),
      prisma.store.findFirst({
        where: { id: product.storeId, seller: { userId } },
        select: { id: true },
      }),
    ]);
    isStoreOwner = Boolean(ownStore);
    if (existingReview) {
      myReview = {
        reviewId: existingReview.id,
        rating: existingReview.rating,
        comment: existingReview.comment ?? "",
        images: existingReview.images.map((i) => i.url),
      };
    } else if (allVariantIds.length > 0) {
      const reviewedSet = new Set(reviewedSubs.map((r) => r.subOrderId));
      const openSub = await prisma.subOrder.findFirst({
        where: {
          status: "COMPLETED",
          order: { buyerId: userId },
          items: { some: { variantId: { in: allVariantIds } } },
          id: { notIn: [...reviewedSet] },
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (openSub) {
        canReview = true;
        reviewSubOrderId = openSub.id;
      }
    }
  }

  const locale = await getLocale();
  const t = await getTranslations("Product");

  const title = localizedName(product.title, locale);
  const description = localizedName(product.description, locale);

  const CARD_INCLUDE = {
    images: { orderBy: { position: "asc" as const }, take: 1 },
    variants: {
      where: { isActive: true },
      select: { price: true, compareAtPrice: true, stock: true },
    },
    store: { select: { name: true } },
  };

  const variantIds = product.variants.map((v) => v.id);
  const [soldAgg, related, coBoughtIds] = await Promise.all([
    variantIds.length
      ? prisma.orderItem.aggregate({
          _sum: { quantity: true },
          where: {
            variantId: { in: variantIds },
            subOrder: { status: "COMPLETED" },
          },
        })
      : Promise.resolve({ _sum: { quantity: null } }),
    prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        status: "ACTIVE",
        id: { not: product.id },
      },
      orderBy: { ratingAvg: "desc" },
      take: 6,
      include: CARD_INCLUDE,
    }),
    coPurchasedProductIds(product.id, 6),
  ]);

  // "Customers also bought" — load the co-purchased products, keep their rank.
  const coBoughtRows = coBoughtIds.length
    ? await prisma.product.findMany({
        where: {
          id: { in: coBoughtIds },
          status: "ACTIVE",
          store: { status: "ACTIVE" },
        },
        include: CARD_INCLUDE,
      })
    : [];
  const coBought = coBoughtIds
    .map((id) => coBoughtRows.find((p) => p.id === id))
    .filter((p): p is (typeof coBoughtRows)[number] => Boolean(p));
  const sold = soldAgg._sum.quantity ?? 0;

  // Live flash pricing overrides the normal price while stock remains.
  const flashMap = await getFlashPricesFor(product.variants.map((v) => v.id));
  let flashEndsAt: Date | null = null;
  const pickerVariants: PickerVariant[] = product.variants.map((v) => {
    const flash = flashMap.get(v.id);
    if (flash && (!flashEndsAt || flash.endsAt < flashEndsAt)) {
      flashEndsAt = flash.endsAt;
    }
    const eff = effectivePrice(v);
    return {
      id: v.id,
      name: v.name,
      attributes: (v.attributes ?? {}) as Record<string, string>,
      price: flash ? flash.salePrice : eff.price,
      compareAtPrice: flash ? Number(v.price) : eff.compareAt,
      stock: v.stock,
    };
  });

  const galleryImages = product.images.map((i) => ({
    url: i.url,
    alt: i.alt ?? title,
  }));

  // Specs from structured product data + available option axes.
  const specs: Spec[] = [];
  if (product.brand)
    specs.push({ label: t("brand"), value: product.brand.name });
  specs.push({
    label: t("category"),
    value: localizedName(product.category.name, locale),
  });
  specs.push({
    label: t("conditionLabel"),
    value: product.condition === "USED" ? t("used") : t("new"),
  });
  if (product.weightGrams)
    specs.push({ label: t("weight"), value: `${product.weightGrams} g` });
  const axes: Record<string, Set<string>> = {};
  for (const v of pickerVariants) {
    for (const [k, val] of Object.entries(v.attributes)) {
      (axes[k] ??= new Set()).add(val);
    }
  }
  for (const [k, set] of Object.entries(axes)) {
    specs.push({ label: k, value: [...set].join(", ") });
  }

  const policies = (product.store.policies ?? {}) as {
    shipping?: string;
    returns?: string;
  };
  const shippingText = policies.shipping || t("shippingDefault");
  const returnsText = policies.returns || t("returnsDefault");

  // Structured data (JSON-LD) for rich search results.
  const prices = pickerVariants.map((v) => v.price);
  const productLd = productJsonLd({
    locale,
    slug: product.slug,
    name: title,
    description,
    images: product.images.map((i) => i.url),
    sku: product.variants[0]?.sku ?? null,
    brand: product.brand?.name ?? null,
    lowPrice: prices.length ? Math.min(...prices) : 0,
    highPrice: prices.length ? Math.max(...prices) : 0,
    inStock: pickerVariants.some((v) => v.stock > 0),
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
  });
  const breadcrumbLd = breadcrumbJsonLd(locale, [
    { name: "Hezalli", path: "" },
    {
      name: localizedName(product.category.name, locale),
      path: `/c/${product.category.slug}`,
    },
    { name: title, path: `/product/${product.slug}` },
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd} />
      <RecordView slug={product.slug} />
      {/* Breadcrumb */}
      <nav className="text-muted-foreground mb-4 flex flex-wrap items-center gap-1 text-sm">
        <Link href="/" className="hover:text-foreground">
          {t("home")}
        </Link>
        <span>/</span>
        <Link
          href={`/c/${product.category.slug}`}
          className="hover:text-foreground"
        >
          {localizedName(product.category.name, locale)}
        </Link>
        <span>/</span>
        <span className="text-foreground truncate">{title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="min-w-0">
          <ProductGallery images={galleryImages} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h1>
            {flashEndsAt ? (
              <span className="inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-rose-500 to-orange-500 px-2.5 py-1 text-sm font-medium text-white">
                <Zap className="size-4 fill-white" /> {t("flashSale")}
                <Countdown to={(flashEndsAt as Date).toISOString()} />
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1">
                <StarRating rating={product.ratingAvg} size={16} />
                <span className="text-muted-foreground">
                  {product.ratingCount > 0
                    ? `${product.ratingAvg.toFixed(1)} (${product.ratingCount})`
                    : t("noReviews")}
                </span>
              </span>
              {sold > 0 ? (
                <span className="text-muted-foreground">
                  · {t("sold", { count: sold })}
                </span>
              ) : null}
            </div>
          </div>

          <VariantPicker
            variants={pickerVariants}
            product={{
              slug: product.slug,
              title,
              image: product.images[0]?.url ?? null,
              storeId: product.storeId,
              storeName: product.store.name,
              storeSlug: product.store.slug,
              sizeClass:
                product.sizeClass ?? product.category.defaultSizeClass,
            }}
          />

          <ProductShare productId={product.id} initialInWishlist={inWishlist} />

          {/* Seller card */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="bg-muted flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full">
              {product.store.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.store.logo}
                  alt={product.store.name}
                  className="size-full object-cover"
                />
              ) : (
                <StoreIcon className="text-muted-foreground size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{product.store.name}</p>
              <p className="text-muted-foreground text-xs">
                {product.store.ratingCount > 0
                  ? `${product.store.ratingAvg.toFixed(1)} ★ (${product.store.ratingCount})`
                  : t("newStore")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/store/${product.store.slug}`}>
                  {t("visitStore")}
                </Link>
              </Button>
              {isStoreOwner ? null : (
                <ChatLauncher storeId={product.storeId} label={t("chat")} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-10">
        <ProductTabs
          description={description}
          specs={specs}
          shipping={shippingText}
          returns={returnsText}
          ratingAvg={product.ratingAvg}
          ratingCount={product.ratingCount}
        />
      </div>

      {/* Reviews */}
      <ProductReviews
        productId={product.id}
        slug={product.slug}
        sort={rsort}
        page={rpage}
        canReview={canReview}
        reviewSubOrderId={reviewSubOrderId}
        myReview={myReview}
        isStoreOwner={isStoreOwner}
      />

      {/* Customers also bought (co-purchase) */}
      {coBought.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            {t("alsoBought")}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {coBought.map((p) => (
              <ProductCard key={p.id} item={toCardItem(p, locale)} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Related */}
      {related.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            {t("related")}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {related.map((p) => (
              <ProductCard key={p.id} item={toCardItem(p, locale)} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
