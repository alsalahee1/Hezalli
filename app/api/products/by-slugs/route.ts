import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { toCardItem } from "@/lib/products";

// Resolve a list of product slugs to display cards, preserving the given order.
// Used by the guest "recently viewed" strip (slugs live in localStorage).
export async function GET(req: NextRequest) {
  const slugsParam = req.nextUrl.searchParams.get("slugs") ?? "";
  const locale = req.nextUrl.searchParams.get("locale") ?? "en";
  const slugs = slugsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (slugs.length === 0) return NextResponse.json({ items: [] });

  const products = await prisma.product.findMany({
    where: { slug: { in: slugs }, status: "ACTIVE" },
    select: {
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
    },
  });

  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const items = slugs
    .map((s) => bySlug.get(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => toCardItem(p, locale));

  return NextResponse.json({ items });
}
