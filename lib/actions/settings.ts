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
  wallet_bills_enabled: boolean;
  wallet_daily_outflow_usd: number;
  wallet_monthly_outflow_usd: number;
  express_enabled: boolean;
  default_express_fee: number;
  std_eta_min_days: number;
  std_eta_max_days: number;
  express_eta_min_days: number;
  express_eta_max_days: number;
  express_auto_assign: boolean;
  courier_assign_strategy: "balanced" | "nearest";
  courier_delivery_fee: number;
  points_enabled: boolean;
  point_handling_fee: number;
  max_delivery_attempts: number;
  pickup_fee: number;
  point_transfer_fee: number;
  stale_parcel_days: number;
  pickup_window_days: number;
  driver_cash_limit: number;
  driver_cod_max_age_hours: number;
  point_cash_limit: number;
  trust_step_deliveries: number;
  trust_step_bonus_usd: number;
  trust_bonus_cap_usd: number;
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

  const dailyOut = money2(input.wallet_daily_outflow_usd);
  const monthlyOut = money2(input.wallet_monthly_outflow_usd);
  if (![dailyOut, monthlyOut].every((n) => Number.isFinite(n) && n >= 0))
    return { error: "badWalletLimits" };

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

  const pointFee = money2(input.point_handling_fee);
  if (!Number.isFinite(pointFee) || pointFee < 0)
    return { error: "badPointFee" };
  const pickupFee = money2(input.pickup_fee);
  if (!Number.isFinite(pickupFee) || pickupFee < 0)
    return { error: "badPointFee" };
  const transferFee = money2(input.point_transfer_fee);
  if (!Number.isFinite(transferFee) || transferFee < 0)
    return { error: "badPointFee" };
  const staleDays = int(input.stale_parcel_days);
  if (!Number.isFinite(staleDays) || staleDays < 1 || staleDays > 60)
    return { error: "badDays" };
  const pickupWindow = int(input.pickup_window_days);
  if (!Number.isFinite(pickupWindow) || pickupWindow < 1 || pickupWindow > 60)
    return { error: "badDays" };
  const maxAttempts = int(input.max_delivery_attempts);
  if (!Number.isFinite(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
    return { error: "badMaxAttempts" };

  const deliveryFee = money2(input.courier_delivery_fee);
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0)
    return { error: "badDeliveryFee" };

  // COD credit control limits: 0 turns a check off.
  const driverCashLimit = money2(input.driver_cash_limit);
  const pointCashLimit = money2(input.point_cash_limit);
  if (
    ![driverCashLimit, pointCashLimit].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  )
    return { error: "badCashLimit" };
  const codMaxAge = int(input.driver_cod_max_age_hours);
  if (!Number.isFinite(codMaxAge) || codMaxAge < 0 || codMaxAge > 720)
    return { error: "badCashLimit" };
  const trustStep = int(input.trust_step_deliveries);
  if (!Number.isFinite(trustStep) || trustStep < 0 || trustStep > 10000)
    return { error: "badCashLimit" };
  const trustBonus = money2(input.trust_step_bonus_usd);
  const trustCap = money2(input.trust_bonus_cap_usd);
  if (![trustBonus, trustCap].every((n) => Number.isFinite(n) && n >= 0))
    return { error: "badCashLimit" };

  // wallet_bills_provider and delivery_window_days are ops/advanced settings not
  // part of this form — left untouched here (set via seed / DB), so their stored
  // values are preserved.
  const values: Omit<
    PlatformSettings,
    "wallet_bills_provider" | "delivery_window_days"
  > = {
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
    wallet_bills_enabled: Boolean(input.wallet_bills_enabled),
    wallet_daily_outflow_usd: dailyOut,
    wallet_monthly_outflow_usd: monthlyOut,
    express_enabled: Boolean(input.express_enabled),
    default_express_fee: expressFee,
    std_eta_min_days: etas[0],
    std_eta_max_days: etas[1],
    express_eta_min_days: etas[2],
    express_eta_max_days: etas[3],
    express_auto_assign: Boolean(input.express_auto_assign),
    courier_assign_strategy:
      input.courier_assign_strategy === "nearest" ? "nearest" : "balanced",
    courier_delivery_fee: deliveryFee,
    points_enabled: Boolean(input.points_enabled),
    point_handling_fee: pointFee,
    max_delivery_attempts: maxAttempts,
    pickup_fee: pickupFee,
    point_transfer_fee: transferFee,
    stale_parcel_days: staleDays,
    pickup_window_days: pickupWindow,
    driver_cash_limit: driverCashLimit,
    driver_cod_max_age_hours: codMaxAge,
    point_cash_limit: pointCashLimit,
    trust_step_deliveries: trustStep,
    trust_step_bonus_usd: trustBonus,
    trust_bonus_cap_usd: trustCap,
  };

  await prisma.$transaction(
    (Object.keys(values) as (keyof typeof values)[]).map((key) =>
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
