"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { PlatformSettings } from "@/lib/settings";

type Result = { ok?: boolean; error?: string };

export type SettingsInput = {
  platform_name: string;
  platform_logo: string;
  commission_percent: number; // human percent, e.g. 10
  return_window_days: number;
  return_response_days: number;
  auto_complete_days: number;
  min_payout_usd: number;
  cod_enabled: boolean;
  maintenance_mode: boolean;
};

const int = (n: unknown) => Math.trunc(Number(n));

export async function savePlatformSettings(
  input: SettingsInput,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const pct = Number(input.commission_percent);
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100)
    return { error: "badCommission" };
  const days = [
    input.return_window_days,
    input.return_response_days,
    input.auto_complete_days,
  ].map(int);
  if (days.some((d) => !Number.isFinite(d) || d < 0 || d > 365))
    return { error: "badDays" };
  const minPayout = Number(input.min_payout_usd);
  if (!Number.isFinite(minPayout) || minPayout < 0)
    return { error: "badPayout" };

  const values: PlatformSettings = {
    platform_name: (input.platform_name || "Hezalli").trim().slice(0, 80),
    platform_logo: (input.platform_logo || "").trim().slice(0, 500),
    commission_rate: Math.round(pct * 100) / 10000,
    return_window_days: days[0],
    return_response_days: days[1],
    auto_complete_days: days[2],
    min_payout_usd: Math.round(minPayout * 100) / 100,
    cod_enabled: Boolean(input.cod_enabled),
    maintenance_mode: Boolean(input.maintenance_mode),
  };

  await prisma.$transaction(
    (Object.keys(values) as (keyof PlatformSettings)[]).map((key) =>
      prisma.platformSetting.upsert({
        where: { key },
        create: { key, value: values[key] as never },
        update: { value: values[key] as never },
      }),
    ),
  );

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "settings.update",
      entity: "PlatformSetting",
      entityId: "platform",
      meta: values as never,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/settings`);
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}
