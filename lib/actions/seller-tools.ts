"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { slugifyWithFallback } from "@/lib/slug";

type Result = { ok?: boolean; error?: string };

// --- Vacation mode: temporarily hide all of a store's products from buyers ---
export async function setVacation(
  onVacation: boolean,
  message?: string,
): Promise<Result> {
  const s = await requireSellerStore();
  if (!s) return { error: "forbidden" };
  await prisma.store.update({
    where: { id: s.storeId },
    data: {
      isOnVacation: onVacation,
      vacationMessage: message?.trim().slice(0, 300) || null,
    },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/tools`);
  return { ok: true };
}

// --- Chat auto-reply: first message from a buyer triggers this canned reply ---
export async function setAutoReply(message: string): Promise<Result> {
  const s = await requireSellerStore();
  if (!s) return { error: "forbidden" };
  await prisma.store.update({
    where: { id: s.storeId },
    data: { autoReplyMessage: message.trim().slice(0, 500) || null },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/tools`);
  return { ok: true };
}

const MAX_IMPORT_ROWS = 500;

export async function importProductsCsv(
  csvText: string,
): Promise<Result & { created?: number; errors?: string[] }> {
  const s = await requireSellerStore();
  if (!s) return { error: "forbidden" };

  const rows = parseCsv(csvText);
  if (rows.length < 2) return { error: "empty" };
  if (rows.length - 1 > MAX_IMPORT_ROWS) return { error: "tooMany" };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iTitleEn = col("title_en");
  const iTitleAr = col("title_ar");
  const iCat = col("category_slug");
  const iPrice = col("price");
  const iStock = col("stock");
  const iDesc = col("description_en");
  if (iTitleEn < 0 || iCat < 0 || iPrice < 0) return { error: "badHeader" };

  const cats = await prisma.category.findMany({
    select: { id: true, slug: true },
  });
  const catBySlug = new Map(cats.map((c) => [c.slug, c.id]));

  let created = 0;
  const errors: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const titleEn = (row[iTitleEn] ?? "").trim();
    const catSlug = (row[iCat] ?? "").trim();
    const price = Number(row[iPrice]);
    const stock =
      iStock >= 0 ? Math.max(0, Math.trunc(Number(row[iStock]) || 0)) : 0;

    if (!titleEn) {
      errors.push(`Row ${r + 1}: missing title_en`);
      continue;
    }
    const categoryId = catBySlug.get(catSlug);
    if (!categoryId) {
      errors.push(`Row ${r + 1}: unknown category "${catSlug}"`);
      continue;
    }
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`Row ${r + 1}: invalid price`);
      continue;
    }

    const base = slugifyWithFallback(titleEn, "product");
    let slug = base;
    for (
      let n = 2;
      await prisma.product.findUnique({
        where: { slug },
        select: { id: true },
      });
      n++
    ) {
      slug = `${base}-${n}`;
    }

    await prisma.product.create({
      data: {
        storeId: s.storeId,
        categoryId,
        title: { en: titleEn, ar: (row[iTitleAr] ?? "").trim() },
        slug,
        description:
          iDesc >= 0 && row[iDesc]?.trim()
            ? { en: row[iDesc].trim() }
            : undefined,
        basePrice: price,
        status: "DRAFT",
        variants: {
          create: {
            sku: `${slug}-${randomBytes(3).toString("hex")}`,
            name: "Default",
            price,
            stock,
          },
        },
      },
    });
    created++;
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/products`);
  return { ok: true, created, errors };
}
