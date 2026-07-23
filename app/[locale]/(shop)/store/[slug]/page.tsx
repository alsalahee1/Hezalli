import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  Package,
  Star,
  Store as StoreIcon,
  Users,
} from "lucide-react";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getListing } from "@/lib/search";
import type { StorePolicies } from "@/lib/validations/store";
import { ProductCard } from "@/components/product/product-card";
import { ListingPagination } from "@/components/shop/listing-pagination";
import { FollowButton } from "@/components/store/follow-button";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function getStore(slug: string) {
  const store = await prisma.store.findUnique({
    where: { slug },
    include: {
      seller: { select: { kycStatus: true } },
      _count: {
        select: {
          products: { where: { status: "ACTIVE" } },
          followers: true,
        },
      },
    },
  });
  // Post-moderation model: suspended/closed stores disappear from the public
  // site (the seller still sees their dashboard).
  if (!store || store.status !== "ACTIVE") return null;
  return store;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStore(slug);
  return { title: store?.name ?? "Store" };
}

export default async function StorePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const store = await getStore(slug);
  if (!store) notFound();

  // The store's catalog, through the same listing engine as /search — pinned
  // to this store, paginated via ?page=.
  const listing = await getListing(await searchParams, locale, {
    sellerSlug: slug,
  });

  const session = await auth();
  let following = false;
  if (session?.user?.id) {
    following = Boolean(
      await prisma.storeFollow.findUnique({
        where: {
          userId_storeId: { userId: session.user.id, storeId: store.id },
        },
        select: { id: true },
      }),
    );
  }

  const t = await getTranslations("StorePage");
  const format = await getFormatter();
  const policies = (store.policies ?? {}) as StorePolicies;
  const verified = store.seller.kycStatus === "VERIFIED";
  const hasPolicies = Boolean(
    policies.returnPolicy || policies.shippingPolicy || policies.contact,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12">
      {/* Banner: the store's uploaded image, or a brand gradient fallback. */}
      {store.banner ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={store.banner}
          alt=""
          className="h-36 w-full rounded-b-xl object-cover sm:h-48"
        />
      ) : (
        <div className="from-primary/25 via-primary/10 to-muted h-36 rounded-b-xl bg-gradient-to-l sm:h-48" />
      )}

      {/* Identity row */}
      <div className="-mt-8 flex flex-col gap-4 px-2 sm:flex-row sm:items-end">
        <div className="bg-primary text-primary-foreground ring-background flex size-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold ring-4">
          {store.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logo}
              alt=""
              className="size-full rounded-full object-cover"
            />
          ) : (
            store.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            {store.name}
            {verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600">
                <BadgeCheck className="size-3.5" />
                {t("verified")}
              </span>
            ) : null}
          </h1>
          {store.description ? (
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {store.description}
            </p>
          ) : null}
        </div>
        <FollowButton
          storeId={store.id}
          initialFollowing={following}
          initialCount={store._count.followers}
        />
      </div>

      {store.isOnVacation ? (
        <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center text-sm">
          <p className="font-medium text-amber-700">{t("onVacation")}</p>
          {store.vacationMessage ? (
            <p className="text-muted-foreground mt-1">
              {store.vacationMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-card rounded-lg border p-3 text-center">
          <Star className="text-primary mx-auto mb-1 size-4" />
          <p className="text-sm font-semibold">
            {store.ratingCount > 0
              ? `${store.ratingAvg.toFixed(1)} (${store.ratingCount})`
              : t("newStore")}
          </p>
          <p className="text-muted-foreground text-xs">{t("rating")}</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <Package className="text-primary mx-auto mb-1 size-4" />
          <p className="text-sm font-semibold">{store._count.products}</p>
          <p className="text-muted-foreground text-xs">{t("products")}</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <Users className="text-primary mx-auto mb-1 size-4" />
          <p className="text-sm font-semibold">{store._count.followers}</p>
          <p className="text-muted-foreground text-xs">{t("followers")}</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <CalendarDays className="text-primary mx-auto mb-1 size-4" />
          <p className="text-sm font-semibold">
            {format.dateTime(store.createdAt, {
              month: "short",
              year: "numeric",
            })}
          </p>
          <p className="text-muted-foreground text-xs">{t("memberSince")}</p>
        </div>
      </div>

      {/* Products */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">{t("productsTitle")}</h2>
        {listing.items.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {listing.items.map((item) => (
                <ProductCard key={item.slug} item={item} />
              ))}
            </div>
            <ListingPagination
              page={listing.page}
              totalPages={listing.totalPages}
            />
          </>
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-sm">
            <StoreIcon className="size-6" />
            <p>{t("noProductsYet")}</p>
          </div>
        )}
      </section>

      {/* Policies */}
      {hasPolicies ? (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">{t("policiesTitle")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {policies.returnPolicy ? (
              <div className="bg-card rounded-lg border p-4">
                <h3 className="mb-1 text-sm font-semibold">
                  {t("returnPolicy")}
                </h3>
                <p className="text-muted-foreground text-sm whitespace-pre-line">
                  {policies.returnPolicy}
                </p>
              </div>
            ) : null}
            {policies.shippingPolicy ? (
              <div className="bg-card rounded-lg border p-4">
                <h3 className="mb-1 text-sm font-semibold">
                  {t("shippingPolicy")}
                </h3>
                <p className="text-muted-foreground text-sm whitespace-pre-line">
                  {policies.shippingPolicy}
                </p>
              </div>
            ) : null}
            {policies.contact ? (
              <div className="bg-card rounded-lg border p-4 sm:col-span-2">
                <h3 className="mb-1 text-sm font-semibold">{t("contact")}</h3>
                <p className="text-muted-foreground text-sm">
                  {policies.contact}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
