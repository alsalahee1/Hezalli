"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { brandSchema } from "@/lib/validations/category";
import { fieldErrors } from "@/lib/validations/auth";

// Message values are i18n KEYS under the `AdminBrands` namespace.
export type FormState = {
  errors?: Record<string, string>;
  formError?: string;
  ok?: boolean;
};

async function revalidate() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/brands`);
}

function parse(formData: FormData) {
  return brandSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    logo: formData.get("logo") || undefined,
  });
}

export async function saveBrand(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState> {
  if (!(await requireAdminId())) return { formError: "forbidden" };

  const id = String(formData.get("id") ?? "");
  const parsed = parse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { name, slug, logo } = parsed.data;

  // Uniqueness on both name and slug (excluding self on edit).
  const clash = await prisma.brand.findFirst({
    where: {
      OR: [{ name }, { slug }],
      ...(id ? { NOT: { id } } : {}),
    },
    select: { name: true, slug: true },
  });
  if (clash) {
    return {
      errors:
        clash.slug === slug ? { slug: "slugTaken" } : { name: "nameTaken" },
    };
  }

  const data = { name, slug, logo: logo ? logo : null };
  if (id) {
    const existing = await prisma.brand.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return { formError: "notFound" };
    await prisma.brand.update({ where: { id }, data });
  } else {
    await prisma.brand.create({ data });
  }

  await revalidate();
  return { ok: true };
}

export async function deleteBrand(formData: FormData): Promise<void> {
  if (!(await requireAdminId())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const counts = await prisma.brand.findUnique({
    where: { id },
    select: { _count: { select: { products: true } } },
  });
  if (!counts || counts._count.products > 0) return; // guard: brand in use

  await prisma.brand.delete({ where: { id } });
  await revalidate();
}
