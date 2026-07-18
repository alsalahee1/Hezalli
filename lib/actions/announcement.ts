"use server";

import { revalidatePath } from "next/cache";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

export type Announcement = { text: string; active: boolean };

export async function getAnnouncement(): Promise<Announcement> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: "announcement" },
    select: { value: true },
  });
  const v = (row?.value ?? {}) as Partial<Announcement>;
  return {
    text: typeof v.text === "string" ? v.text : "",
    active: Boolean(v.active),
  };
}

// Admin sets/clears the site-wide announcement bar.
export async function saveAnnouncement(input: Announcement): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const value = { text: input.text.trim(), active: Boolean(input.active) };
  await prisma.platformSetting.upsert({
    where: { key: "announcement" },
    create: { key: "announcement", value },
    update: { value },
  });
  // The bar renders in the shop layout on every page.
  revalidatePath("/", "layout");
  return { ok: true };
}
