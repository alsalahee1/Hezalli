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

import { prisma } from "@/lib/prisma";
import type { StorePolicies } from "@/lib/validations/store";

type Props = { params: Promise<{ locale: string; slug: string }> };

async function getStore(slug: string) {
  const store = await prisma.store.findUnique({
    where: { slug },
    include: {
      seller: { select: { kycStatus: true } },
      _count: { select: { products: { where: { status: "ACTIVE" } } } },
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

export default async function StorePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const store = await getStore(slug);
  if (!store) notFound();

  const t = await getTranslations("StorePage");
  const format = await getFormatter();
  const policies = (store.policies ?? {}) as StorePolicies;
  const verified = store.seller.kycStatus === "VERIFIED";
  const hasPolicies = Boolean(
    policies.returnPolicy || policies.shippingPolicy || policies.contact,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12">
      {/* Banner (image upload arrives with file storage) */}
      <div className="from-primary/25 via-primary/10 to-muted h-36 rounded-b-xl bg-gradient-to-l sm:h-48" />

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
      </div>

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
          <p className="text-sm font-semibold">0</p>
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

      {/* Products (grid fills in Phase 5) */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">{t("productsTitle")}</h2>
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-sm">
          <StoreIcon className="size-6" />
          <p>
            {store._count.products > 0
              ? t("productsComing", { count: store._count.products })
              : t("noProductsYet")}
          </p>
        </div>
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
