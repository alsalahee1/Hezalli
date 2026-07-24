"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { BOTS, isBotId, type BotId } from "@/lib/ai/bot-constants";
import { sendWeeklyDigest } from "@/lib/ai/digest";
import { DEFAULT_INTRO } from "@/lib/ai/prompt-defaults";
import { getTelegramToken, telegramApi } from "@/lib/integrations/telegram";
import { prisma } from "@/lib/prisma";
import type { AiSettingKey, PlatformSettings } from "@/lib/settings";

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
  courier_offer_timeout_minutes: number;
  courier_offer_max_rounds: number;
  job_board_enabled: boolean;
  job_board_window_minutes: number;
  job_board_max_active_jobs: number;
  board_reminder_minutes: number;
  pickup_deadline_hours: number;
  dispatch_hours_start: number;
  dispatch_hours_end: number;
  seller_ship_days: number;
  driver_min_acceptance_rate: number;
  driver_acceptance_min_offers: number;
  courier_delivery_fee: number;
  points_enabled: boolean;
  point_handling_fee: number;
  max_delivery_attempts: number;
  pickup_fee: number;
  point_transfer_fee: number;
  stale_parcel_days: number;
  pickup_window_days: number;
  queue_enabled: boolean;
  queue_slot_minutes: number;
  queue_slot_capacity: number;
  queue_reminder_minutes: number;
  driver_cash_limit: number;
  driver_cod_max_age_hours: number;
  point_cash_limit: number;
  trust_step_deliveries: number;
  trust_step_bonus_usd: number;
  trust_bonus_cap_usd: number;
  badge_bonus_usd: number;
  badge_bonus_cap_usd: number;
  badge_priority_dispatch: boolean;
  season_badge_name: string;
  season_start_date: string;
  season_end_date: string;
  season_target_deliveries: number;
  cod_wallet_pay_enabled: boolean;
  platform_wallet_email: string;
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
  // Arrival queue tunables (docs §44): slot length 5–240 min, per-slot cap 0–99.
  const queueSlotMinutes = int(input.queue_slot_minutes);
  if (
    !Number.isFinite(queueSlotMinutes) ||
    queueSlotMinutes < 5 ||
    queueSlotMinutes > 240
  )
    return { error: "badQueue" };
  const queueSlotCapacity = int(input.queue_slot_capacity);
  if (
    !Number.isFinite(queueSlotCapacity) ||
    queueSlotCapacity < 0 ||
    queueSlotCapacity > 99
  )
    return { error: "badQueue" };
  const queueReminderMinutes = int(input.queue_reminder_minutes);
  if (
    !Number.isFinite(queueReminderMinutes) ||
    queueReminderMinutes < 0 ||
    queueReminderMinutes > 240
  )
    return { error: "badQueue" };
  const maxAttempts = int(input.max_delivery_attempts);
  if (!Number.isFinite(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
    return { error: "badMaxAttempts" };

  const deliveryFee = money2(input.courier_delivery_fee);
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0)
    return { error: "badDeliveryFee" };

  // Driver offer window (0 = classic forced assignment) + cascade depth, and
  // the dispatch working hours (whole hours, 0–23; start == end = 24/7).
  const offerTimeout = int(input.courier_offer_timeout_minutes);
  if (!Number.isFinite(offerTimeout) || offerTimeout < 0 || offerTimeout > 1440)
    return { error: "badOfferTimeout" };
  const offerRounds = int(input.courier_offer_max_rounds);
  if (!Number.isFinite(offerRounds) || offerRounds < 1 || offerRounds > 20)
    return { error: "badOfferRounds" };
  // Job board: the board-only window before push-offers start (0 = both at
  // once) and the per-driver active-jobs cap for claims (0 = no cap).
  const boardWindow = int(input.job_board_window_minutes);
  if (!Number.isFinite(boardWindow) || boardWindow < 0 || boardWindow > 1440)
    return { error: "badBoardWindow" };
  const boardMaxJobs = int(input.job_board_max_active_jobs);
  if (!Number.isFinite(boardMaxJobs) || boardMaxJobs < 0 || boardMaxJobs > 100)
    return { error: "badBoardCap" };
  // Repeat reminder for unclaimed board jobs (0 = off, max a day).
  const boardReminder = int(input.board_reminder_minutes);
  if (
    !Number.isFinite(boardReminder) ||
    boardReminder < 0 ||
    boardReminder > 1440
  )
    return { error: "badBoardReminder" };
  // Pickup deadline for accepted-but-never-scanned jobs (0 = off, max a week).
  const pickupDeadline = int(input.pickup_deadline_hours);
  if (
    !Number.isFinite(pickupDeadline) ||
    pickupDeadline < 0 ||
    pickupDeadline > 168
  )
    return { error: "badPickupDeadline" };
  const dispatchStart = int(input.dispatch_hours_start);
  const dispatchEnd = int(input.dispatch_hours_end);
  if (
    ![dispatchStart, dispatchEnd].every(
      (h) => Number.isFinite(h) && h >= 0 && h <= 23,
    )
  )
    return { error: "badDispatchHours" };

  // Seller ship-SLA (0 = off) and the driver acceptance gate (rate 0 = off).
  const shipDays = int(input.seller_ship_days);
  if (!Number.isFinite(shipDays) || shipDays < 0 || shipDays > 60)
    return { error: "badDays" };
  const minAcceptRate = int(input.driver_min_acceptance_rate);
  if (
    !Number.isFinite(minAcceptRate) ||
    minAcceptRate < 0 ||
    minAcceptRate > 100
  )
    return { error: "badAcceptRate" };
  const minAcceptOffers = int(input.driver_acceptance_min_offers);
  if (
    !Number.isFinite(minAcceptOffers) ||
    minAcceptOffers < 1 ||
    minAcceptOffers > 1000
  )
    return { error: "badAcceptRate" };

  // The Hezalli wallet destination for in-app COD remittance. Empty disables
  // the feature; otherwise it must look like an email (the resolver additionally
  // requires it to be an active ADMIN before any money moves).
  const platformWalletEmail = (input.platform_wallet_email || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
  if (
    platformWalletEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(platformWalletEmail)
  )
    return { error: "badWalletEmail" };

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
  const badgeBonus = money2(input.badge_bonus_usd);
  const badgeCap = money2(input.badge_bonus_cap_usd);
  if (![badgeBonus, badgeCap].every((n) => Number.isFinite(n) && n >= 0))
    return { error: "badCashLimit" };

  // Seasonal badge: either fully configured (name + two valid dates in order)
  // or fully off (empty name). Dates are plain YYYY-MM-DD.
  const seasonName = (input.season_badge_name || "").trim().slice(0, 60);
  const seasonStart = (input.season_start_date || "").trim();
  const seasonEnd = (input.season_end_date || "").trim();
  const seasonTarget = int(input.season_target_deliveries);
  if (
    !Number.isFinite(seasonTarget) ||
    seasonTarget < 0 ||
    seasonTarget > 10000
  )
    return { error: "badSeason" };
  if (seasonName) {
    const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (
      !isDay(seasonStart) ||
      !isDay(seasonEnd) ||
      seasonStart > seasonEnd ||
      seasonTarget < 1
    )
      return { error: "badSeason" };
  }

  // wallet_bills_provider and delivery_window_days are ops/advanced settings not
  // part of this form — left untouched here (set via seed / DB), so their stored
  // values are preserved. All ai_* keys are managed on the dedicated Admin →
  // Assistant page (saveAssistantSettings / saveAssistantKey / saveAssistantAvatar).
  const values: Omit<
    PlatformSettings,
    "wallet_bills_provider" | "delivery_window_days" | AiSettingKey
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
    courier_offer_timeout_minutes: offerTimeout,
    courier_offer_max_rounds: offerRounds,
    job_board_enabled: Boolean(input.job_board_enabled),
    job_board_window_minutes: boardWindow,
    job_board_max_active_jobs: boardMaxJobs,
    board_reminder_minutes: boardReminder,
    pickup_deadline_hours: pickupDeadline,
    dispatch_hours_start: dispatchStart,
    dispatch_hours_end: dispatchEnd,
    seller_ship_days: shipDays,
    driver_min_acceptance_rate: minAcceptRate,
    driver_acceptance_min_offers: minAcceptOffers,
    courier_delivery_fee: deliveryFee,
    points_enabled: Boolean(input.points_enabled),
    point_handling_fee: pointFee,
    max_delivery_attempts: maxAttempts,
    pickup_fee: pickupFee,
    point_transfer_fee: transferFee,
    stale_parcel_days: staleDays,
    pickup_window_days: pickupWindow,
    queue_enabled: Boolean(input.queue_enabled),
    queue_slot_minutes: queueSlotMinutes,
    queue_slot_capacity: queueSlotCapacity,
    queue_reminder_minutes: queueReminderMinutes,
    driver_cash_limit: driverCashLimit,
    driver_cod_max_age_hours: codMaxAge,
    point_cash_limit: pointCashLimit,
    trust_step_deliveries: trustStep,
    trust_step_bonus_usd: trustBonus,
    trust_bonus_cap_usd: trustCap,
    badge_bonus_usd: badgeBonus,
    badge_bonus_cap_usd: badgeCap,
    badge_priority_dispatch: Boolean(input.badge_priority_dispatch),
    season_badge_name: seasonName,
    season_start_date: seasonName ? seasonStart : "",
    season_end_date: seasonName ? seasonEnd : "",
    season_target_deliveries: seasonTarget,
    cod_wallet_pay_enabled: Boolean(input.cod_wallet_pay_enabled),
    platform_wallet_email: platformWalletEmail,
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

// --- The assistant's Gemini API key ---------------------------------------
// Stored as its own PlatformSetting row ("gemini_api_key") — deliberately NOT
// part of the SettingsInput/PlatformSettings object, so the secret is never
// echoed back through the settings form or serialized into other pages.
// lib/ai/gemini.ts reads it, falling back to the GEMINI_API_KEY env var.

export async function saveAssistantKey(apiKey: string | null): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  // null / empty clears the stored key (the env var, if any, takes over).
  const key = (apiKey ?? "").trim();
  if (key && (key.length < 20 || key.length > 300 || /\s/.test(key)))
    return { error: "badKey" };

  await prisma.platformSetting.upsert({
    where: { key: "gemini_api_key" },
    create: { key: "gemini_api_key", value: key },
    update: { value: key },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "settings.ai_key",
      entity: "PlatformSetting",
      entityId: "gemini_api_key",
      // Record that the key changed, never the key itself.
      meta: { set: Boolean(key) },
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/assistant`);
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}

// --- Assistant tuning (Admin → Assistant page) -----------------------------
// Everything except the API key (saveAssistantKey) and avatar
// (saveAssistantAvatar). A "" / 0 value means "use the env/default".

export type AssistantSettingsInput = {
  enabled: boolean;
  model: string;
  replyMode: string;
  ttsVoice: string;
  ttsStyle: string;
  maxPerHour: number;
  dailyCap: number;
  spendCapUsd: number;
  telegramEnabled: boolean;
  whatsappEnabled: boolean;
  digestEnabled: boolean;
  digestChatId: string;
  defaultBot: string;
  intro: string;
  // Per-character persona/greeting, keyed by bot id (e.g. { sam, balqis }).
  personas: Record<string, string>;
  greetings: Record<string, string>;
  temperature: number;
  maxTokens: number;
};

const REPLY_MODES = ["", "text", "voice", "both", "match"];

export async function saveAssistantSettings(
  input: AssistantSettingsInput,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const model = (input.model || "").trim().slice(0, 60);
  if (model && !/^[a-zA-Z0-9._-]+$/.test(model)) return { error: "badModel" };

  const mode = (input.replyMode || "").trim().toLowerCase();
  if (!REPLY_MODES.includes(mode)) return { error: "badReplyMode" };

  const voice = (input.ttsVoice || "").trim().slice(0, 40);
  if (voice && !/^[a-zA-Z ]+$/.test(voice)) return { error: "badVoice" };

  const style = (input.ttsStyle || "").trim().slice(0, 500);

  const maxPerHour = int(input.maxPerHour);
  const dailyCap = int(input.dailyCap);
  if (
    ![maxPerHour, dailyCap].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1_000_000,
    )
  )
    return { error: "badCaps" };
  const spendCap = money2(input.spendCapUsd);
  if (!Number.isFinite(spendCap) || spendCap < 0 || spendCap > 1_000_000)
    return { error: "badCaps" };

  // Base intro is free text; storing it verbatim would freeze the wording even
  // if we later improve DEFAULT_INTRO, so an unchanged/blank intro normalises to
  // "" (= use the default). Personas/greetings are per-character free text.
  const introRaw = (input.intro || "").trim().slice(0, 2000);
  const intro = introRaw === DEFAULT_INTRO.trim() ? "" : introRaw;
  const botText: Array<[AiSettingKey, string]> = [];
  for (const id of Object.keys(BOTS) as BotId[]) {
    botText.push([
      BOTS[id].personaKey,
      (input.personas?.[id] || "").trim().slice(0, 4000),
    ]);
    botText.push([
      BOTS[id].greetingKey,
      (input.greetings?.[id] || "").trim().slice(0, 600),
    ]);
  }
  const temperature = Number(input.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1)
    return { error: "badTemperature" };
  const maxTokens = int(input.maxTokens);
  if (!Number.isFinite(maxTokens) || maxTokens < 128 || maxTokens > 8192)
    return { error: "badMaxTokens" };

  const defaultBot = isBotId(input.defaultBot) ? input.defaultBot : "sam";

  // Only re-stamp the default when it actually changes, so an ordinary
  // settings save doesn't reset every shopper's switcher cookie.
  const prevDefault = await prisma.platformSetting.findUnique({
    where: { key: "ai_default_bot" },
    select: { value: true },
  });

  // Shared keys written by this action. Avatars have their own action; the
  // per-character persona/greeting keys are written from `botText` below.
  const shared: Array<[AiSettingKey, string | number | boolean]> = [
    ["ai_assistant_enabled", Boolean(input.enabled)],
    ["ai_default_bot", defaultBot],
    ["ai_gemini_model", model],
    ["ai_reply_mode", mode],
    ["ai_tts_voice", voice],
    ["ai_tts_style", style],
    ["ai_max_per_hour", maxPerHour],
    ["ai_daily_cap", dailyCap],
    ["ai_spend_cap_usd", spendCap],
    ["ai_channel_telegram", Boolean(input.telegramEnabled)],
    ["ai_channel_whatsapp", Boolean(input.whatsappEnabled)],
    ["ai_digest_enabled", Boolean(input.digestEnabled)],
    ["ai_digest_chat_id", (input.digestChatId || "").trim().slice(0, 40)],
    ["ai_intro", intro],
    ["ai_temperature", Math.round(temperature * 100) / 100],
    ["ai_max_tokens", maxTokens],
  ];
  if ((prevDefault?.value ?? "sam") !== defaultBot) {
    shared.push(["ai_default_bot_at", String(Date.now())]);
  }
  const entries: Array<[AiSettingKey, string | number | boolean]> = [
    ...shared,
    ...botText,
  ];

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.platformSetting.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      }),
    ),
  );

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "settings.assistant",
      entity: "PlatformSetting",
      entityId: "assistant",
      meta: Object.fromEntries(entries) as never,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/assistant`);
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}

// Send the weekly digest right now (admin "test" button). Ignores the enabled
// toggle but still needs a chat id + a working bot. Save settings first so the
// current chat id is used.
export async function sendTestDigest(): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const res = await sendWeeklyDigest(Date.now(), { force: true });
  return res.sent ? { ok: true } : { error: `digest_${res.reason}` };
}

// --- Telegram connection (Admin → Assistant) --------------------------------
// Pasting a BotFather token connects the bot end-to-end: the token is verified
// with getMe, a fresh webhook secret is generated, Telegram's webhook is
// pointed at /api/telegram/webhook, and everything is stored in PlatformSetting
// rows (kept out of getPlatformSettings, like the Gemini key). Passing null
// disconnects: the webhook is removed (best-effort) and the rows are cleared.

const TELEGRAM_KEYS = [
  "telegram_bot_token",
  "telegram_webhook_secret",
  "telegram_bot_username",
];

export async function connectTelegram(
  botToken: string | null,
): Promise<Result & { username?: string }> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  if (botToken === null) {
    try {
      const active = await getTelegramToken();
      if (active) await telegramApi(active, "deleteWebhook");
    } catch {
      // Best-effort — clearing the rows below disables the bot regardless.
    }
    await prisma.platformSetting.deleteMany({
      where: { key: { in: TELEGRAM_KEYS } },
    });
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "settings.telegram_disconnect",
        entity: "PlatformSetting",
        entityId: "telegram_bot_token",
        meta: {},
      },
    });
    revalidatePath(`/${locale}/admin/assistant`);
    return { ok: true };
  }

  const token = botToken.trim();
  if (!/^\d+:[A-Za-z0-9_-]{25,}$/.test(token))
    return { error: "badTokenFormat" };

  // Telegram only delivers webhooks over public HTTPS.
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (!base.startsWith("https://")) return { error: "noAppUrl" };

  // Verify the token really works and learn the bot's @username.
  let username = "";
  try {
    const me = await telegramApi(token, "getMe");
    username = String(
      (me.result as { username?: string } | undefined)?.username ?? "",
    );
  } catch {
    return { error: "badToken" };
  }

  // Point Telegram at our webhook with a fresh secret (fail-closed check in
  // the route). drop_pending_updates avoids replaying a backlog on connect.
  const secret = randomBytes(24).toString("hex");
  try {
    await telegramApi(token, "setWebhook", {
      url: `${base}/api/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: true,
    });
  } catch {
    return { error: "webhookFailed" };
  }

  const rows: Array<[string, string]> = [
    ["telegram_bot_token", token],
    ["telegram_webhook_secret", secret],
    ["telegram_bot_username", username],
  ];
  await prisma.$transaction(
    rows.map(([key, value]) =>
      prisma.platformSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      }),
    ),
  );

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "settings.telegram_connect",
      entity: "PlatformSetting",
      entityId: "telegram_bot_token",
      // Record the bot identity, never the token or secret.
      meta: { username },
    },
  });

  revalidatePath(`/${locale}/admin/assistant`);
  return { ok: true, username };
}

// --- A character's avatar ----------------------------------------------------
// The image on the chat launcher bubble and inside the widget, per bot. Admins
// upload a new one (via /api/upload) or reset to the bundled default.

export async function saveAssistantAvatar(
  botId: BotId,
  url: string | null,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  if (!isBotId(botId)) return { error: "badBot" };
  const key = BOTS[botId].avatarKey;

  // null / empty resets to the bundled default image: deleting the row lets
  // getSetting() fall back to the SETTING_DEFAULTS entry for this key.
  const value = (url ?? "").trim().slice(0, 500);
  if (value && !/^(\/|https?:\/\/)/.test(value)) return { error: "badAvatar" };

  if (value) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  } else {
    await prisma.platformSetting.deleteMany({ where: { key } });
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "settings.ai_avatar",
      entity: "PlatformSetting",
      entityId: key,
      meta: { bot: botId, url: value },
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/assistant`);
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}

// --- The default character ---------------------------------------------------
// Which bot greets visitors before they pick one. Split out from the big
// settings save so the admin's "Set as default" choice on a character tab
// persists on click, instead of waiting for the form's Save button.

export async function saveDefaultBot(botId: BotId): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  if (!isBotId(botId)) return { error: "badBot" };

  // Stamp the change so shopper switcher cookies set before now stop
  // overriding the default (see lib/ai/active-bot.ts:getActiveBot).
  const at = String(Date.now());
  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key: "ai_default_bot" },
      create: { key: "ai_default_bot", value: botId },
      update: { value: botId },
    }),
    prisma.platformSetting.upsert({
      where: { key: "ai_default_bot_at" },
      create: { key: "ai_default_bot_at", value: at },
      update: { value: at },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "settings.ai_default_bot",
      entity: "PlatformSetting",
      entityId: "ai_default_bot",
      meta: { bot: botId },
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/assistant`);
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}

// --- Exchange rates (DECISIONS.md §3) -------------------------------------
// Display rates per currency zone: Yemen's rial trades at very different
// values in the Sana'a-area (old rial) and Aden-area (new rial) markets, so
// YER is managed per zone; SAR/AED use the single DEFAULT-zone row.

export type ExchangeRateInput = {
  currency: "YER" | "SAR" | "AED";
  zone: "DEFAULT" | "NORTH" | "SOUTH";
  rate: number;
};

const RATE_CURRENCIES = ["YER", "SAR", "AED"];
const RATE_ZONES = ["DEFAULT", "NORTH", "SOUTH"];

export async function saveExchangeRates(
  rows: ExchangeRateInput[],
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  if (
    rows.length === 0 ||
    rows.some(
      (r) =>
        !RATE_CURRENCIES.includes(r.currency) ||
        !RATE_ZONES.includes(r.zone) ||
        !Number.isFinite(r.rate) ||
        r.rate <= 0,
    )
  ) {
    return { error: "invalid" };
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.exchangeRate.upsert({
        where: { currency_zone: { currency: r.currency, zone: r.zone } },
        update: { rate: r.rate, updatedBy: adminId },
        create: {
          currency: r.currency,
          zone: r.zone,
          rate: r.rate,
          updatedBy: adminId,
        },
      }),
    ),
  );

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "settings.exchange_rates",
      entity: "ExchangeRate",
      entityId: "rates",
      meta: rows as never,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/settings`);
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}
