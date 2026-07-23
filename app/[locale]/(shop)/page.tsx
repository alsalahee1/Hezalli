import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { ArrowRight, Wallet } from "lucide-react";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { auth } from "@/auth";
import { getRequestDisplayCurrency } from "@/lib/currency";
import { type DisplayCurrency } from "@/lib/currency-constants";
import { getWalletView } from "@/lib/wallet";
import { localizedName } from "@/lib/categories";
import { getFlashSales } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { toCardItem, type ProductCardItem } from "@/lib/products";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { HeroCarousel, type HeroBanner } from "@/components/home/hero-carousel";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductStrip } from "@/components/home/product-strip";
import { QamariyaPattern } from "@/components/layout/qamariya-pattern";
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

// The home strips are identical for every visitor (only Recently-Viewed and the
// wallet card are personalised), so their data is cached across requests rather
// than re-queried on every load. Best-sellers aggregates the whole completed-order
// history, so it gets the longest window.
const STRIP_TTL = 120; // seconds
const BEST_SELLERS_TTL = 300; // seconds

const featuredItems = unstable_cache(
  async (locale: string, display: DisplayCurrency) => {
    const rows = await prisma.product.findMany({
      where: { status: "ACTIVE", isFeatured: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: CARD_SELECT,
    });
    return rows.map((r) => toCardItem(r, locale, display));
  },
  ["home-featured"],
  { revalidate: STRIP_TTL, tags: ["home-strips"] },
);

const dealsItems = unstable_cache(
  async (locale: string, display: DisplayCurrency) => {
    const rows = await prisma.product.findMany({
      where: {
        status: "ACTIVE",
        variants: { some: { isActive: true, compareAtPrice: { not: null } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: CARD_SELECT,
    });
    return rows.map((r) => toCardItem(r, locale, display));
  },
  ["home-deals"],
  { revalidate: STRIP_TTL, tags: ["home-strips"] },
);

const newArrivalsItems = unstable_cache(
  async (locale: string, display: DisplayCurrency) => {
    const rows = await prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: CARD_SELECT,
    });
    return rows.map((r) => toCardItem(r, locale, display));
  },
  ["home-new-arrivals"],
  { revalidate: STRIP_TTL, tags: ["home-strips"] },
);

const bestSellersItems = unstable_cache(
  async (locale: string, display: DisplayCurrency) => {
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
      .slice(0, TAKE)
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
    return products
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((p) => toCardItem(p, locale, display));
  },
  ["home-best-sellers"],
  { revalidate: BEST_SELLERS_TTL, tags: ["home-strips"] },
);

const categoryStripsData = unstable_cache(
  async (locale: string, display: DisplayCurrency) => {
    const cats = await prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: { position: "asc" },
      take: 3,
      select: { slug: true, name: true },
    });
    return Promise.all(
      cats.map(async (c) => ({
        slug: c.slug,
        name: localizedName(c.name, locale),
        items: (
          await prisma.product.findMany({
            where: { status: "ACTIVE", category: { slug: c.slug } },
            orderBy: { ratingAvg: "desc" },
            take: 5,
            select: CARD_SELECT,
          })
        ).map((r) => toCardItem(r, locale, display)),
      })),
    );
  },
  ["home-category-strips"],
  { revalidate: STRIP_TTL, tags: ["home-strips"] },
);

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
        <section className="from-primary/10 relative flex flex-col items-center gap-4 overflow-hidden rounded-xl bg-gradient-to-br to-transparent py-12 text-center">
          <QamariyaPattern />
          <h1 className="relative max-w-2xl px-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heroTitle")}
          </h1>
          <p className="text-muted-foreground relative max-w-xl px-4">
            {t("heroSubtitle")}
          </p>
        </section>
      )}

      <Suspense fallback={null}>
        <WalletHomeCard />
      </Suspense>

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

// Signed-in shoppers see their HezalliPay balance right on the home page.
async function WalletHomeCard() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const t = await getTranslations("Wallet");
  const format = await getFormatter();
  const { balance } = await getWalletView(session.user.id, 0);

  return (
    <Link
      href="/account/wallet"
      className="from-primary/10 hover:border-primary/40 mt-4 flex items-center gap-4 rounded-xl border bg-gradient-to-br to-transparent p-4 transition-colors"
    >
      <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
        <Wallet className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">{t("balance")}</p>
        <p className="text-xl font-bold" dir="ltr">
          {format.number(balance, { style: "currency", currency: "USD" })}
        </p>
      </div>
      <span className="text-primary flex items-center gap-1 text-sm font-semibold">
        {t("openWallet")}
        <ArrowRight className="size-4 rtl:rotate-180" />
      </span>
    </Link>
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
  const items = await featuredItems(locale, await getRequestDisplayCurrency());
  if (items.length === 0) return null;
  return <ProductStrip title={t("featured")} items={items} />;
}

async function DealsSection({ locale }: { locale: string }) {
  const t = await getTranslations("Home");
  return (
    <ProductStrip
      title={t("deals")}
      items={await dealsItems(locale, await getRequestDisplayCurrency())}
      seeAllHref="/deals"
      seeAllLabel={t("seeAll")}
    />
  );
}

async function NewArrivalsSection({ locale }: { locale: string }) {
  const t = await getTranslations("Home");
  return (
    <ProductStrip
      title={t("newArrivals")}
      items={await newArrivalsItems(locale, await getRequestDisplayCurrency())}
      seeAllHref="/search?sort=newest"
      seeAllLabel={t("seeAll")}
    />
  );
}

async function BestSellersSection({ locale }: { locale: string }) {
  const t = await getTranslations("Home");
  return (
    <ProductStrip
      title={t("bestSellers")}
      items={await bestSellersItems(locale, await getRequestDisplayCurrency())}
      seeAllHref="/search?sort=best_selling"
      seeAllLabel={t("seeAll")}
    />
  );
}

async function CategoryStrips({ locale }: { locale: string }) {
  const t = await getTranslations("Home");
  const strips = await categoryStripsData(
    locale,
    await getRequestDisplayCurrency(),
  );
  return (
    <>
      {strips.map((s) => (
        <ProductStrip
          key={s.slug}
          title={s.name}
          items={s.items}
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
    const display = await getRequestDisplayCurrency();
    initial = rows.map((r) => toCardItem(r.product, locale, display));
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
