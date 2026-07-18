"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { NOTIF_CATEGORIES } from "@/lib/notif-prefs";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Save the user's per-category email preferences.
export async function saveNotificationPrefs(
  prefs: Record<string, boolean>,
): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const clean: Record<string, boolean> = {};
  for (const c of NOTIF_CATEGORIES) clean[c] = Boolean(prefs[c]);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { notificationPrefs: clean },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/account/settings/notifications`);
  return { ok: true };
}

export async function markNotificationRead(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  await prisma.notification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/account/notifications`);
  return { ok: true };
}
