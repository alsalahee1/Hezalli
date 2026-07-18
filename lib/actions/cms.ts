"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

export type CmsPageInput = {
  slug: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  published: boolean;
};

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function saveCmsPage(input: CmsPageInput): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const slug = input.slug.trim().toLowerCase();
  if (!slugRe.test(slug)) return { error: "badSlug" };
  if (!input.titleEn.trim() && !input.titleAr.trim())
    return { error: "titleRequired" };

  const title = { en: input.titleEn.trim(), ar: input.titleAr.trim() };
  const body = { en: input.bodyEn, ar: input.bodyAr };

  await prisma.cmsPage.upsert({
    where: { slug },
    create: { slug, title, body, published: input.published },
    update: { title, body, published: input.published },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "cms.save",
      entity: "CmsPage",
      entityId: slug,
      meta: { published: input.published },
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/pages`);
  revalidatePath(`/${locale}/p/${slug}`);
  return { ok: true };
}

export async function deleteCmsPage(slug: string): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  await prisma.cmsPage.delete({ where: { slug } }).catch(() => {});
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "cms.delete",
      entity: "CmsPage",
      entityId: slug,
    },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/pages`);
  return { ok: true };
}
