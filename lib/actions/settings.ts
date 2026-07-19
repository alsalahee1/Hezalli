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
  wallet_topup_min_usd: number;
  wallet_topup_max_usd: number;
  wallet_balance_cap_usd: number;
  wallet_cashback_percent: number; // human percent, e.g. 2 = 2%
  wallet_p2p_enabled: boolean;
  express_enabled: boolean;
  default_express_fee: number;
  std_eta_min_days: number;
  std_eta_max_days: number;
  express_eta_min_days: number;
  express_eta_max_days: number;
};

const int = (n: unknown) => Math.trunc(Number(n));
const money2 = (n: unknown) => Math.round(Number(n) * 100) / 100;

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

  const tMin = money2(input.wallet_topup_min_usd);
  const tMax = money2(input.wallet_topup_max_usd);
  const tCap = money2(input.wallet_balance_cap_usd);
  if (
    ![tMin, tMax, tCap].every((n) => Number.isFinite(n) && n >= 0) ||
    tMin > tMax ||
    tMax > tCap
  )
    return { error: "badWalletLimits" };

  const cashPct = Number(input.wallet_cashback_percent);
  if (!Number.isFinite(cashPct) || cashPct < 0 || cashPct >= 100)
    return { error: "badCashback" };

  const expressFee = money2(input.default_express_fee);
  if (!Number.isFinite(expressFee) || expressFee < 0)
    return { error: "badExpressFee" };
  const etas = [
    input.std_eta_min_days,
    input.std_eta_max_days,
    input.express_eta_min_days,
    input.express_eta_max_days,
  ].map(int);
  if (etas.some((d) => !Number.isFinite(d) || d < 0 || d > 365))
    return { error: "badEta" };
  if (etas[0] > etas[1] || etas[2] > etas[3]) return { error: "badEta" };

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
    wallet_topup_min_usd: tMin,
    wallet_topup_max_usd: tMax,
    wallet_balance_cap_usd: tCap,
    wallet_cashback_rate: Math.round(cashPct * 100) / 10000,
    wallet_p2p_enabled: Boolean(input.wallet_p2p_enabled),
    express_enabled: Boolean(input.express_enabled),
    default_express_fee: expressFee,
    std_eta_min_days: etas[0],
    std_eta_max_days: etas[1],
    express_eta_min_days: etas[2],
    express_eta_max_days: etas[3],
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
