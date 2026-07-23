"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { savePlatformSettings } from "@/lib/actions/settings";
import type { PlatformSettings } from "@/lib/settings";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PlatformSettingsForm({
  current,
}: {
  current: PlatformSettings;
}) {
  const t = useTranslations("AdminSettings");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [f, setF] = useState({
    platform_name: current.platform_name,
    platform_logo: current.platform_logo,
    commission_percent: String(
      Math.round(current.commission_rate * 10000) / 100,
    ),
    return_window_days: String(current.return_window_days),
    return_response_days: String(current.return_response_days),
    auto_complete_days: String(current.auto_complete_days),
    min_payout_usd: String(current.min_payout_usd),
    wallet_topup_min_usd: String(current.wallet_topup_min_usd),
    wallet_topup_max_usd: String(current.wallet_topup_max_usd),
    wallet_balance_cap_usd: String(current.wallet_balance_cap_usd),
    wallet_cashback_percent: String(
      Math.round(current.wallet_cashback_rate * 10000) / 100,
    ),
    wallet_daily_outflow_usd: String(current.wallet_daily_outflow_usd),
    wallet_monthly_outflow_usd: String(current.wallet_monthly_outflow_usd),
    default_express_fee: String(current.default_express_fee),
    courier_delivery_fee: String(current.courier_delivery_fee),
    std_eta_min_days: String(current.std_eta_min_days),
    std_eta_max_days: String(current.std_eta_max_days),
    express_eta_min_days: String(current.express_eta_min_days),
    express_eta_max_days: String(current.express_eta_max_days),
    cod_enabled: current.cod_enabled,
    maintenance_mode: current.maintenance_mode,
    wallet_p2p_enabled: current.wallet_p2p_enabled,
    wallet_bills_enabled: current.wallet_bills_enabled,
    express_enabled: current.express_enabled,
    express_auto_assign: current.express_auto_assign,
    courier_assign_strategy: current.courier_assign_strategy,
    courier_offer_timeout_minutes: String(
      current.courier_offer_timeout_minutes,
    ),
    courier_offer_max_rounds: String(current.courier_offer_max_rounds),
    job_board_enabled: current.job_board_enabled,
    job_board_window_minutes: String(current.job_board_window_minutes),
    job_board_max_active_jobs: String(current.job_board_max_active_jobs),
    dispatch_hours_start: String(current.dispatch_hours_start),
    dispatch_hours_end: String(current.dispatch_hours_end),
    seller_ship_days: String(current.seller_ship_days),
    driver_min_acceptance_rate: String(current.driver_min_acceptance_rate),
    driver_acceptance_min_offers: String(current.driver_acceptance_min_offers),
    points_enabled: current.points_enabled,
    point_handling_fee: String(current.point_handling_fee),
    max_delivery_attempts: String(current.max_delivery_attempts),
    pickup_fee: String(current.pickup_fee),
    point_transfer_fee: String(current.point_transfer_fee),
    stale_parcel_days: String(current.stale_parcel_days),
    pickup_window_days: String(current.pickup_window_days),
    driver_cash_limit: String(current.driver_cash_limit),
    driver_cod_max_age_hours: String(current.driver_cod_max_age_hours),
    point_cash_limit: String(current.point_cash_limit),
    trust_step_deliveries: String(current.trust_step_deliveries),
    trust_step_bonus_usd: String(current.trust_step_bonus_usd),
    trust_bonus_cap_usd: String(current.trust_bonus_cap_usd),
    cod_wallet_pay_enabled: current.cod_wallet_pay_enabled,
    platform_wallet_email: current.platform_wallet_email,
  });
  const set = (k: keyof typeof f, v: string | boolean) => {
    setF((s) => ({ ...s, [k]: v }));
    setDone(false);
  };

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await savePlatformSettings({
        platform_name: f.platform_name,
        platform_logo: f.platform_logo,
        commission_percent: Number(f.commission_percent),
        return_window_days: Number(f.return_window_days),
        return_response_days: Number(f.return_response_days),
        auto_complete_days: Number(f.auto_complete_days),
        min_payout_usd: Number(f.min_payout_usd),
        wallet_topup_min_usd: Number(f.wallet_topup_min_usd),
        wallet_topup_max_usd: Number(f.wallet_topup_max_usd),
        wallet_balance_cap_usd: Number(f.wallet_balance_cap_usd),
        wallet_cashback_percent: Number(f.wallet_cashback_percent),
        wallet_daily_outflow_usd: Number(f.wallet_daily_outflow_usd),
        wallet_monthly_outflow_usd: Number(f.wallet_monthly_outflow_usd),
        default_express_fee: Number(f.default_express_fee),
        courier_delivery_fee: Number(f.courier_delivery_fee),
        std_eta_min_days: Number(f.std_eta_min_days),
        std_eta_max_days: Number(f.std_eta_max_days),
        express_eta_min_days: Number(f.express_eta_min_days),
        express_eta_max_days: Number(f.express_eta_max_days),
        cod_enabled: f.cod_enabled,
        maintenance_mode: f.maintenance_mode,
        wallet_p2p_enabled: f.wallet_p2p_enabled,
        wallet_bills_enabled: f.wallet_bills_enabled,
        express_enabled: f.express_enabled,
        express_auto_assign: f.express_auto_assign,
        courier_assign_strategy: f.courier_assign_strategy,
        courier_offer_timeout_minutes: Number(f.courier_offer_timeout_minutes),
        courier_offer_max_rounds: Number(f.courier_offer_max_rounds),
        job_board_enabled: f.job_board_enabled,
        job_board_window_minutes: Number(f.job_board_window_minutes),
        job_board_max_active_jobs: Number(f.job_board_max_active_jobs),
        dispatch_hours_start: Number(f.dispatch_hours_start),
        dispatch_hours_end: Number(f.dispatch_hours_end),
        seller_ship_days: Number(f.seller_ship_days),
        driver_min_acceptance_rate: Number(f.driver_min_acceptance_rate),
        driver_acceptance_min_offers: Number(f.driver_acceptance_min_offers),
        points_enabled: f.points_enabled,
        point_handling_fee: Number(f.point_handling_fee),
        max_delivery_attempts: Number(f.max_delivery_attempts),
        pickup_fee: Number(f.pickup_fee),
        point_transfer_fee: Number(f.point_transfer_fee),
        stale_parcel_days: Number(f.stale_parcel_days),
        pickup_window_days: Number(f.pickup_window_days),
        driver_cash_limit: Number(f.driver_cash_limit),
        driver_cod_max_age_hours: Number(f.driver_cod_max_age_hours),
        point_cash_limit: Number(f.point_cash_limit),
        trust_step_deliveries: Number(f.trust_step_deliveries),
        trust_step_bonus_usd: Number(f.trust_step_bonus_usd),
        trust_bonus_cap_usd: Number(f.trust_bonus_cap_usd),
        cod_wallet_pay_enabled: f.cod_wallet_pay_enabled,
        platform_wallet_email: f.platform_wallet_email,
      });
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        router.refresh();
      }
    });

  return (
    <section className="space-y-5 rounded-lg border p-5">
      <div>
        <h2 className="font-medium">{t("platformTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("platformDesc")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")}>
          <Input
            value={f.platform_name}
            onChange={(e) => set("platform_name", e.target.value)}
          />
        </Field>
        <Field label={t("logo")} hint={t("logoHint")}>
          <Input
            value={f.platform_logo}
            onChange={(e) => set("platform_logo", e.target.value)}
            dir="ltr"
            placeholder="/logo.svg"
          />
        </Field>
        <Field label={t("commission")} hint={t("commissionHint")}>
          <Input
            type="number"
            value={f.commission_percent}
            onChange={(e) => set("commission_percent", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("minPayout")} hint={t("minPayoutHint")}>
          <Input
            type="number"
            value={f.min_payout_usd}
            onChange={(e) => set("min_payout_usd", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("returnWindow")} hint={t("daysHint")}>
          <Input
            type="number"
            value={f.return_window_days}
            onChange={(e) => set("return_window_days", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("returnResponse")} hint={t("daysHint")}>
          <Input
            type="number"
            value={f.return_response_days}
            onChange={(e) => set("return_response_days", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("autoComplete")} hint={t("daysHint")}>
          <Input
            type="number"
            value={f.auto_complete_days}
            onChange={(e) => set("auto_complete_days", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("walletTopupMin")} hint={t("walletLimitsHint")}>
          <Input
            type="number"
            value={f.wallet_topup_min_usd}
            onChange={(e) => set("wallet_topup_min_usd", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("walletTopupMax")} hint={t("walletLimitsHint")}>
          <Input
            type="number"
            value={f.wallet_topup_max_usd}
            onChange={(e) => set("wallet_topup_max_usd", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("walletBalanceCap")} hint={t("walletCapHint")}>
          <Input
            type="number"
            value={f.wallet_balance_cap_usd}
            onChange={(e) => set("wallet_balance_cap_usd", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("walletCashback")} hint={t("walletCashbackHint")}>
          <Input
            type="number"
            value={f.wallet_cashback_percent}
            onChange={(e) => set("wallet_cashback_percent", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("walletDailyOut")} hint={t("walletOutflowHint")}>
          <Input
            type="number"
            value={f.wallet_daily_outflow_usd}
            onChange={(e) => set("wallet_daily_outflow_usd", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("walletMonthlyOut")} hint={t("walletOutflowHint")}>
          <Input
            type="number"
            value={f.wallet_monthly_outflow_usd}
            onChange={(e) => set("wallet_monthly_outflow_usd", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("expressFee")} hint={t("expressFeeHint")}>
          <Input
            type="number"
            value={f.default_express_fee}
            onChange={(e) => set("default_express_fee", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("courierFee")} hint={t("courierFeeHint")}>
          <Input
            type="number"
            value={f.courier_delivery_fee}
            onChange={(e) => set("courier_delivery_fee", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("stdEta")} hint={t("etaHint")}>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={f.std_eta_min_days}
              onChange={(e) => set("std_eta_min_days", e.target.value)}
              dir="ltr"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              value={f.std_eta_max_days}
              onChange={(e) => set("std_eta_max_days", e.target.value)}
              dir="ltr"
            />
          </div>
        </Field>
        <Field label={t("expressEta")} hint={t("etaHint")}>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={f.express_eta_min_days}
              onChange={(e) => set("express_eta_min_days", e.target.value)}
              dir="ltr"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              value={f.express_eta_max_days}
              onChange={(e) => set("express_eta_max_days", e.target.value)}
              dir="ltr"
            />
          </div>
        </Field>
        <Field label={t("pointFee")} hint={t("pointFeeHint")}>
          <Input
            type="number"
            value={f.point_handling_fee}
            onChange={(e) => set("point_handling_fee", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("pickupFee")} hint={t("pickupFeeHint")}>
          <Input
            type="number"
            value={f.pickup_fee}
            onChange={(e) => set("pickup_fee", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("transferFee")} hint={t("transferFeeHint")}>
          <Input
            type="number"
            value={f.point_transfer_fee}
            onChange={(e) => set("point_transfer_fee", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("staleDays")} hint={t("staleDaysHint")}>
          <Input
            type="number"
            value={f.stale_parcel_days}
            onChange={(e) => set("stale_parcel_days", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("pickupWindow")} hint={t("pickupWindowHint")}>
          <Input
            type="number"
            value={f.pickup_window_days}
            onChange={(e) => set("pickup_window_days", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("driverCashLimit")} hint={t("driverCashLimitHint")}>
          <Input
            type="number"
            value={f.driver_cash_limit}
            onChange={(e) => set("driver_cash_limit", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("codMaxAge")} hint={t("codMaxAgeHint")}>
          <Input
            type="number"
            value={f.driver_cod_max_age_hours}
            onChange={(e) => set("driver_cod_max_age_hours", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("pointCashLimit")} hint={t("pointCashLimitHint")}>
          <Input
            type="number"
            value={f.point_cash_limit}
            onChange={(e) => set("point_cash_limit", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("trustStep")} hint={t("trustStepHint")}>
          <Input
            type="number"
            value={f.trust_step_deliveries}
            onChange={(e) => set("trust_step_deliveries", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("trustBonus")} hint={t("trustBonusHint")}>
          <Input
            type="number"
            value={f.trust_step_bonus_usd}
            onChange={(e) => set("trust_step_bonus_usd", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("trustCap")} hint={t("trustCapHint")}>
          <Input
            type="number"
            value={f.trust_bonus_cap_usd}
            onChange={(e) => set("trust_bonus_cap_usd", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("maxAttempts")} hint={t("maxAttemptsHint")}>
          <Input
            type="number"
            value={f.max_delivery_attempts}
            onChange={(e) => set("max_delivery_attempts", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("assignStrategy")} hint={t("assignStrategyHint")}>
          <select
            value={f.courier_assign_strategy}
            onChange={(e) => set("courier_assign_strategy", e.target.value)}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="balanced">{t("strategyBalanced")}</option>
            <option value="nearest">{t("strategyNearest")}</option>
          </select>
        </Field>
        <Field label={t("offerTimeout")} hint={t("offerTimeoutHint")}>
          <Input
            type="number"
            value={f.courier_offer_timeout_minutes}
            onChange={(e) =>
              set("courier_offer_timeout_minutes", e.target.value)
            }
            dir="ltr"
          />
        </Field>
        <Field label={t("offerRounds")} hint={t("offerRoundsHint")}>
          <Input
            type="number"
            value={f.courier_offer_max_rounds}
            onChange={(e) => set("courier_offer_max_rounds", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("jobBoardWindow")} hint={t("jobBoardWindowHint")}>
          <Input
            type="number"
            value={f.job_board_window_minutes}
            onChange={(e) => set("job_board_window_minutes", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("jobBoardMaxJobs")} hint={t("jobBoardMaxJobsHint")}>
          <Input
            type="number"
            value={f.job_board_max_active_jobs}
            onChange={(e) => set("job_board_max_active_jobs", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("dispatchHoursStart")} hint={t("dispatchHoursHint")}>
          <Input
            type="number"
            value={f.dispatch_hours_start}
            onChange={(e) => set("dispatch_hours_start", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("dispatchHoursEnd")} hint={t("dispatchHoursHint")}>
          <Input
            type="number"
            value={f.dispatch_hours_end}
            onChange={(e) => set("dispatch_hours_end", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("sellerShipDays")} hint={t("sellerShipDaysHint")}>
          <Input
            type="number"
            value={f.seller_ship_days}
            onChange={(e) => set("seller_ship_days", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("minAcceptRate")} hint={t("minAcceptRateHint")}>
          <Input
            type="number"
            value={f.driver_min_acceptance_rate}
            onChange={(e) => set("driver_min_acceptance_rate", e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t("minAcceptOffers")} hint={t("minAcceptOffersHint")}>
          <Input
            type="number"
            value={f.driver_acceptance_min_offers}
            onChange={(e) =>
              set("driver_acceptance_min_offers", e.target.value)
            }
            dir="ltr"
          />
        </Field>
      </div>

      <div className="space-y-2 border-t pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.cod_enabled}
            onChange={(e) => set("cod_enabled", e.target.checked)}
          />
          {t("codEnabled")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.cod_wallet_pay_enabled}
            onChange={(e) => set("cod_wallet_pay_enabled", e.target.checked)}
          />
          {t("codWalletPay")}
          <span className="text-muted-foreground text-xs">
            {t("codWalletPayHint")}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.express_enabled}
            onChange={(e) => set("express_enabled", e.target.checked)}
          />
          {t("expressEnabled")}
          <span className="text-muted-foreground text-xs">
            {t("expressEnabledHint")}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.express_auto_assign}
            onChange={(e) => set("express_auto_assign", e.target.checked)}
          />
          {t("expressAutoAssign")}
          <span className="text-muted-foreground text-xs">
            {t("expressAutoAssignHint")}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.job_board_enabled}
            onChange={(e) => set("job_board_enabled", e.target.checked)}
          />
          {t("jobBoard")}
          <span className="text-muted-foreground text-xs">
            {t("jobBoardHint")}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.points_enabled}
            onChange={(e) => set("points_enabled", e.target.checked)}
          />
          {t("pointsEnabled")}
          <span className="text-muted-foreground text-xs">
            {t("pointsEnabledHint")}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.maintenance_mode}
            onChange={(e) => set("maintenance_mode", e.target.checked)}
          />
          {t("maintenance")}
          <span className="text-muted-foreground text-xs">
            {t("maintenanceHint")}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.wallet_p2p_enabled}
            onChange={(e) => set("wallet_p2p_enabled", e.target.checked)}
          />
          {t("walletP2p")}
          <span className="text-xs text-amber-600">{t("walletP2pHint")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={f.wallet_bills_enabled}
            onChange={(e) => set("wallet_bills_enabled", e.target.checked)}
          />
          {t("walletBills")}
          <span className="text-muted-foreground text-xs">
            {t("walletBillsHint")}
          </span>
        </label>
      </div>

      <div className="border-t pt-4">
        <Field
          label={t("platformWalletEmail")}
          hint={t("platformWalletEmailHint")}
        >
          <Input
            type="email"
            dir="ltr"
            value={f.platform_wallet_email}
            onChange={(e) => set("platform_wallet_email", e.target.value)}
            placeholder="admin@hezalli.com"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        {done ? (
          <span className="text-sm text-emerald-600">{t("saved")}</span>
        ) : null}
        {err ? (
          <span className="text-destructive text-sm">{t(`err_${err}`)}</span>
        ) : null}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? (
        <span className="text-muted-foreground block text-xs">{hint}</span>
      ) : null}
    </label>
  );
}
