import { NextResponse, type NextRequest } from "next/server";

import { localizedName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";

// Lightweight autocomplete: case-insensitive substring (ILIKE) over product
// titles + category names. Kept separate from the full-text search used on the
// results page because prefixes matter here.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const locale = req.nextUrl.searchParams.get("locale") ?? "en";
  if (q.length < 2) {
    return NextResponse.json({ products: [], categories: [] });
  }
  const like = `%${q}%`;

  const [products, categories] = await Promise.all([
    prisma.$queryRawUnsafe<
      { slug: string; title: unknown; image: string | null }[]
    >(
      `SELECT p.slug, p.title,
        (SELECT url FROM "ProductImage" i WHERE i."productId" = p.id ORDER BY position ASC LIMIT 1) AS image
       FROM "Product" p
       WHERE p.status = 'ACTIVE'
         AND (p.title->>'en' ILIKE $1 OR p.title->>'ar' ILIKE $1)
       LIMIT 6`,
      like,
    ),
    prisma.$queryRawUnsafe<
      { slug: string; name: unknown; icon: string | null }[]
    >(
      `SELECT slug, name, icon FROM "Category"
       WHERE "isActive" = true
         AND (name->>'en' ILIKE $1 OR name->>'ar' ILIKE $1)
       LIMIT 4`,
      like,
    ),
  ]);

  return NextResponse.json({
    products: products.map((p) => ({
      slug: p.slug,
      title: localizedName(p.title, locale),
      image: p.image,
    })),
    categories: categories.map((c) => ({
      slug: c.slug,
      name: localizedName(c.name, locale),
      icon: c.icon,
    })),
  });
}
