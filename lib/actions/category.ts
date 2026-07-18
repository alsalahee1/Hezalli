"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validations/category";
import { fieldErrors } from "@/lib/validations/auth";

// Message values are i18n KEYS under the `AdminCategories` namespace.
export type FormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

async function revalidate() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/categories`);
  // The storefront nav and home page read categories too.
  revalidatePath(`/${locale}`, "layout");
}

function parse(formData: FormData) {
  return categorySchema.safeParse({
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
    slug: formData.get("slug"),
    icon: formData.get("icon") || undefined,
    parentId: formData.get("parentId") || undefined,
    position: formData.get("position") ?? 0,
    isActive: formData.get("isActive") === "on",
  });
}

// Would setting `parentId` as the parent of `id` create a cycle? True if
// parentId is the category itself or one of its descendants.
async function wouldCycle(id: string, parentId: string): Promise<boolean> {
  if (id === parentId) return true;
  const all = await prisma.category.findMany({
    select: { id: true, parentId: true },
  });
  const byId = new Map(all.map((c) => [c.id, c.parentId]));
  let cur: string | null | undefined = parentId;
  while (cur) {
    if (cur === id) return true;
    cur = byId.get(cur);
  }
  return false;
}

export async function createCategory(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  if (!(await requireAdminId())) return { formError: "forbidden" };

  const parsed = parse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { nameEn, nameAr, slug, icon, parentId, position, isActive } =
    parsed.data;

  if (
    await prisma.category.findUnique({ where: { slug }, select: { id: true } })
  )
    return { errors: { slug: "slugTaken" } };

  if (parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    if (!parent) return { errors: { parentId: "parentMissing" } };
  }

  await prisma.category.create({
    data: {
      name: { ar: nameAr, en: nameEn },
      slug,
      icon: icon || null,
      parentId: parentId || null,
      position,
      isActive: isActive ?? true,
    },
  });

  await revalidate();
  return { ok: true };
}

export async function updateCategory(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  if (!(await requireAdminId())) return { formError: "forbidden" };

  const id = String(formData.get("id") ?? "");
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return { formError: "notFound" };

  const parsed = parse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { nameEn, nameAr, slug, icon, parentId, position, isActive } =
    parsed.data;

  if (slug !== existing.slug) {
    const taken = await prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (taken) return { errors: { slug: "slugTaken" } };
  }

  if (parentId) {
    if (await wouldCycle(id, parentId))
      return { errors: { parentId: "parentCycle" } };
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    if (!parent) return { errors: { parentId: "parentMissing" } };
  }

  await prisma.category.update({
    where: { id },
    data: {
      name: { ar: nameAr, en: nameEn },
      slug,
      icon: icon || null,
      parentId: parentId || null,
      position,
      isActive: isActive ?? true,
    },
  });

  await revalidate();
  return { ok: true };
}

export async function deleteCategory(formData: FormData): Promise<void> {
  if (!(await requireAdminId())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const counts = await prisma.category.findUnique({
    where: { id },
    select: { _count: { select: { products: true, children: true } } },
  });
  if (!counts) return;
  // Guard: never orphan products or subcategories.
  if (counts._count.products > 0 || counts._count.children > 0) return;

  await prisma.category.delete({ where: { id } });
  await revalidate();
}
