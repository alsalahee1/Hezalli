import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";

const base =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.AUTH_URL ??
  "http://localhost:3000";

// Regenerated on demand (dynamic) so new products/stores/pages appear.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, stores, categories, pages] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE", store: { status: "ACTIVE" } },
      select: { slug: true, updatedAt: true },
      take: 5000,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.store.findMany({
      where: { status: "ACTIVE" },
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true },
    }),
    prisma.cmsPage.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const urls: MetadataRoute.Sitemap = [];
  const add = (path: string, lastModified?: Date) => {
    for (const locale of routing.locales) {
      urls.push({ url: `${base}/${locale}${path}`, lastModified });
    }
  };

  add(""); // home
  add("/search");
  add("/deals");
  add("/flash-sale");
  for (const p of pages) add(`/p/${p.slug}`, p.updatedAt);
  for (const c of categories) add(`/c/${c.slug}`);
  for (const s of stores) add(`/store/${s.slug}`, s.updatedAt);
  for (const p of products) add(`/product/${p.slug}`, p.updatedAt);

  return urls;
}
