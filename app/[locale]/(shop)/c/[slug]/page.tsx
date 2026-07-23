import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { localizedName } from "@/lib/categories";
import { getRequestDisplayCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getListing } from "@/lib/search";
import { ProductListingView } from "@/components/shop/product-listing-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const category = await prisma.category.findUnique({
    where: { slug },
    select: { name: true },
  });
  if (!category) return {};
  const name = localizedName(category.name, locale);
  return { title: `${name} — Hezalli` };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const category = await prisma.category.findUnique({
    where: { slug },
    select: { name: true, isActive: true },
  });
  if (!category || !category.isActive) notFound();

  const locale = await getLocale();
  const result = await getListing(sp, locale, {
    categorySlug: slug,
    display: await getRequestDisplayCurrency(),
  });

  return (
    <ProductListingView
      result={result}
      mode="category"
      locale={locale}
      heading={localizedName(category.name, locale)}
    />
  );
}
