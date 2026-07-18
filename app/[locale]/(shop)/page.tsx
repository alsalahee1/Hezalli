import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { localizedName } from "@/lib/categories";
import { getFlashSales } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { toCardItem, type ProductCardItem } from "@/lib/products";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { HeroCarousel, type HeroBanner } from "@/components/home/hero-carousel";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductStrip } from "@/components/home/product-strip";
import { RecentlyViewed } from "@/components/home/recently-viewed";
import { FlashSection } from "@/components/promotions/flash-section";

export const dynamic = "force-dynamic";

const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  condition: true,
  ratingAvg: true,
  ratingCount: true,
  images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
  variants: {
    where: { isActive: true },
    select: { price: true, compareAtPrice: true, stock: true },
  },
  store: { select: { name: true } },
} as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const now = new Date();

  const [banners, categories] = await Promise.all([
    prisma.banner.findMany({
      where: {
        position: "home_hero",
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: { position: "asc" },
      select: { slug: true, name: true, icon: true },
    }),
  ]);

  const heroBanners: HeroBanner[] = banners.map((b) => ({
    id: b.id,
    image: b.image,
    href: b.linkUrl,
    title: localizedName(b.title, locale),
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-4">
      <JsonLd data={websiteJsonLd(locale)} />
      <JsonLd data={organizationJsonLd()} />
      {heroBanners.length > 0 ? (
        <HeroCarousel banners={heroBanners} />
      ) : (
        <section className="from-primary/10 flex flex-col items-center gap-4 rounded-xl bg-gradient-to-br to-transparent py-12 text-center">
          <h1 className="max-w-2xl px-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heroTitle")}
          </h1>
          <p className="text-muted-foreground max-w-xl px-4">
            {t("heroSubtitle")}
          </p>
        </section>
      )}

      {/* Category tiles */}
      <section className="py-6">
        <h2 className="mb-3 text-xl font-semibold tracking-tight">
          {t("categoriesTitle")}
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/c/${c.slug}`}
              className="bg-card hover:border-foreground/30 hover:bg-muted flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-colors"
            >
              {c.icon ? (
                <span className="text-2xl" aria-hidden>
                  {c.icon}
                </span>
              ) : null}
              <span className="line-clamp-1 text-xs font-medium">
                {localizedName(c.name, locale)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Suspense fallback={null}>
        <FlashHomeSection />
      </Suspense>

      <Suspense fallback={null}>
        <FeaturedSection locale={locale} />
      </Suspense>

      <Suspense fallback={<StripSkeleton />}>
        <DealsSection locale={locale} />
      </Suspense>
      <Suspense fallback={<StripSkeleton />}>
        <NewArrivalsSection locale={locale} />
      </Suspense>
      <Suspense fallback={<StripSkeleton />}>
        <BestSellersSection locale={locale} />
      </Suspense>

      <RecentlyViewedSection locale={locale} />

      <Suspense fallback={<StripSkeleton />}>
        <CategoryStrips locale={locale} />
      </Suspense>
    </main>
  );
}

async function FlashHomeSection() {
  const t = await getTranslations("Flash");
  const live = await getFlashSales("live");
  if (live.length === 0) return null;
  return (
    <section className="py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
        <Link
          href="/flash-sale"
          className="text-primary text-sm hover:underline"
        >
          {t("seeAll")}
        </Link>
      </div>
      <FlashSection sale={live[0]} />
    </section>
  );
}

async function FeaturedSection({ locale }: { locale: string }) {
  const t = await getTranslations("Home");
  const rows = await prisma.product.findMany({
    where: { status: "ACTIVE", isFeatured: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: CARD_SELECT,
  });
  if (rows.length === 0) return null;
  return (
    <ProductStrip
      title={t("featured")}
      items={rows.map((r) => toCardItem(r, locale))}
    />
  );
}

async function DealsSection({ locale }: { locale: string }) {
  const t = await getTranslations("Home");
  const rows = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      variants: { some: { isActive: true, compareAtPrice: { not: null } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: CARD_SELECT,
  });
  return (
    <ProductStrip
      title={t("deals")}
      items={rows.map((r) => toCardItem(r, locale))}
      seeAllHref="/deals"
      seeAllLabel={t("seeAll")}
    />
  );
}

async function NewArrivalsSection({ locale }: { locale: string }) {
  const t = await getTranslations("Home");
  const rows = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: CARD_SELECT,
  });
  return (
    <ProductStrip
      title={t("newArrivals")}
      items={rows.map((r) => toCardItem(r, locale))}
      seeAllHref="/search?sort=newest"
      seeAllLabel={t("seeAll")}
    />
  );
}

async function BestSellersSection({ locale }: { locale: string }) {
  const t = await getTranslations("Home");
  const TAKE = 10;

  // Real sales first (completed orders), then fill with top-rated products.
  const sold = await prisma.orderItem.groupBy({
    by: ["variantId"],
    where: { subOrder: { status: "COMPLETED" } },
    _sum: { quantity: true },
  });
  const soldVariantIds = sold.map((s) => s.variantId);
  const variantOwners = soldVariantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: soldVariantIds } },
        select: { id: true, productId: true },
      })
    : [];
  const ownerOf = new Map(variantOwners.map((v) => [v.id, v.productId]));
  const soldByProduct = new Map<string, number>();
  for (const s of sold) {
    const pid = ownerOf.get(s.variantId);
    if (pid)
      soldByProduct.set(
        pid,
        (soldByProduct.get(pid) ?? 0) + (s._sum.quantity ?? 0),
      );
  }
  const rankedIds = [...soldByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const fill = await prisma.product.findMany({
    where: { status: "ACTIVE", id: { notIn: rankedIds } },
    orderBy: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
    take: TAKE,
    select: CARD_SELECT,
  });
  const bestIds = [...rankedIds, ...fill.map((f) => f.id)].slice(0, TAKE);

  const products = await prisma.product.findMany({
    where: { id: { in: bestIds }, status: "ACTIVE" },
    select: CARD_SELECT,
  });
  const order = new Map(bestIds.map((id, i) => [id, i]));
  const items: ProductCardItem[] = products
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((p) => toCardItem(p, locale));

  return (
    <ProductStrip
      title={t("bestSellers")}
      items={items}
      seeAllHref="/search?sort=best_selling"
      seeAllLabel={t("seeAll")}
    />
  );
}

async function CategoryStrips({ locale }: { locale: string }) {
  const t = await getTranslations("Home");
  const cats = await prisma.category.findMany({
    where: { parentId: null, isActive: true },
    orderBy: { position: "asc" },
    take: 3,
    select: { slug: true, name: true },
  });
  const strips = await Promise.all(
    cats.map(async (c) => ({
      slug: c.slug,
      name: localizedName(c.name, locale),
      rows: await prisma.product.findMany({
        where: { status: "ACTIVE", category: { slug: c.slug } },
        orderBy: { ratingAvg: "desc" },
        take: 5,
        select: CARD_SELECT,
      }),
    })),
  );
  return (
    <>
      {strips.map((s) => (
        <ProductStrip
          key={s.slug}
          title={s.name}
          items={s.rows.map((r) => toCardItem(r, locale))}
          seeAllHref={`/c/${s.slug}`}
          seeAllLabel={t("seeAll")}
        />
      ))}
    </>
  );
}

async function RecentlyViewedSection({ locale }: { locale: string }) {
  const session = await auth();
  let initial: ProductCardItem[] = [];
  if (session?.user?.id) {
    const rows = await prisma.recentlyViewed.findMany({
      where: { userId: session.user.id, product: { status: "ACTIVE" } },
      orderBy: { viewedAt: "desc" },
      take: 10,
      select: { product: { select: CARD_SELECT } },
    });
    initial = rows.map((r) => toCardItem(r.product, locale));
  }
  return <RecentlyViewed initial={initial} />;
}

function StripSkeleton() {
  return (
    <div className="py-4">
      <div className="bg-muted mb-3 h-6 w-40 animate-pulse rounded" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border">
            <div className="bg-muted aspect-square animate-pulse rounded-t-lg" />
            <div className="space-y-2 p-3">
              <div className="bg-muted h-4 w-full animate-pulse rounded" />
              <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
