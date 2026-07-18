"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export type BannerResult = { ok?: boolean; error?: string };

async function revalidate() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/banners`);
  // The home page reads active banners.
  revalidatePath(`/${locale}`);
}

export type SaveBannerInput = {
  id?: string;
  image: string;
  titleEn?: string;
  titleAr?: string;
  linkUrl?: string;
  position?: string;
  isActive: boolean;
  startsAt?: string; // "yyyy-mm-dd" or ""
  endsAt?: string;
};

export async function saveBanner(
  input: SaveBannerInput,
): Promise<BannerResult> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  if (!input.image) return { error: "imageRequired" };

  const data = {
    image: input.image,
    title: { en: input.titleEn?.trim() ?? "", ar: input.titleAr?.trim() ?? "" },
    linkUrl: input.linkUrl?.trim() || null,
    position: input.position?.trim() || "home_hero",
    isActive: input.isActive,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
  };

  if (input.id) {
    await prisma.banner.update({ where: { id: input.id }, data });
  } else {
    await prisma.banner.create({ data });
  }
  await revalidate();
  return { ok: true };
}

export async function toggleBanner(
  id: string,
  isActive: boolean,
): Promise<BannerResult> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  await prisma.banner.update({ where: { id }, data: { isActive } });
  await revalidate();
  return { ok: true };
}

export async function deleteBanner(id: string): Promise<BannerResult> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  await prisma.banner.delete({ where: { id } });
  await revalidate();
  return { ok: true };
}
