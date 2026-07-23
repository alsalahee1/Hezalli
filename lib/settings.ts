// Platform settings live in the PlatformSetting key/value table. This module is
// the single source of truth for the keys, their types, and their defaults.
// Individual consumers (finance, returns, payouts, shipping) read the same keys
// so an admin edit here changes real behavior.
import { prisma } from "@/lib/prisma";

export type PlatformSettings = {
  platform_name: string;
  platform_logo: string;
  commission_rate: number; // decimal fraction, e.g. 0.10 = 10%
  return_window_days: number;
  return_response_days: number;
  auto_complete_days: number;
  min_payout_usd: number;
  cod_enabled: boolean;
  maintenance_mode: boolean;
  // Express delivery tier (our own Hezalli Express). When off, only standard
  // shipping is offered at checkout. Fee is the platform-wide express price a
  // store falls back to when it hasn't set its own per-zone express fee. ETAs
  // are the delivery-time estimates (in days) shown to buyers at checkout.
  express_enabled: boolean;
  default_express_fee: number;
  std_eta_min_days: number;
  std_eta_max_days: number;
  express_eta_min_days: number;
  express_eta_max_days: number;
  // Scheduled delivery windows (Hezalli Express): how many days ahead a buyer
  // may schedule a preferred delivery day at checkout. 0 turns scheduling off —
  // no window picker is shown and any submitted window is ignored.
  delivery_window_days: number;
  // Auto-hand a shipped Hezalli Express parcel to the least-loaded courier.
  express_auto_assign: boolean;
  // How auto-assignment chooses a courier: "balanced" (fewest active jobs) or
  // "nearest" (a driver in the destination governorate, then fewest jobs).
  courier_assign_strategy: "balanced" | "nearest";
  // Driver job offers (docs/EXPRESS-DELIVERY.md). Auto-assignment OFFERS a
  // parcel to the chosen courier instead of forcing it: minutes they have to
  // accept before it cascades to the next driver (0 = classic forced
  // assignment, no consent step), and how many drivers to try before
  // dispatch staff are alerted instead.
  courier_offer_timeout_minutes: number;
  courier_offer_max_rounds: number;
  // Open driver job board (lib/job-board.ts). When on, a shipped platform
  // parcel is posted on a board every eligible courier can see — with the
  // destination, size, COD amount, and the delivery fee — and the first driver
  // to claim it takes it. Window is how many minutes the parcel stays
  // board-only before the push-offer cascade ALSO starts chasing a driver
  // (0 = push-offers start immediately alongside the board; the parcel stays
  // claimable either way until someone actually holds it). Max active jobs
  // caps how many in-flight deliveries a driver may hold and still claim more
  // (0 = no cap) — an anti-hoarding guard, not a scheduling tool.
  job_board_enabled: boolean;
  job_board_window_minutes: number;
  job_board_max_active_jobs: number;
  // Repeat reminder for unclaimed board jobs (small-fleet safety net): while
  // parcels sit on the board unclaimed, eligible couriers are re-pinged once
  // per this many minutes — one aggregated notification, not one per parcel —
  // during dispatch hours. Complements the one-shot "new job" notification a
  // boarding sends. 0 = off.
  board_reminder_minutes: number;
  // Pickup deadline (lib/offer-sweep.ts): hours a driver may sit on an
  // ACCEPTED job (a tapped offer or a board claim) without a single scan
  // before the sweep takes it back and re-dispatches. Safe to automate
  // precisely because no scan means the driver never touched the physical
  // parcel. Forced and manual assignments (no accepted-offer row) are exempt —
  // ops decisions stay ops'. 0 = off. The clock only advances toward action
  // during dispatch hours, like every other offer clock.
  pickup_deadline_hours: number;
  // Dispatch working hours, platform local time (Asia/Aden, UTC+3). Outside
  // the window nothing is auto-offered and offer clocks pause; parcels queued
  // overnight go out in the first sweep after opening. start == end = 24/7.
  dispatch_hours_start: number;
  dispatch_hours_end: number;
  // Seller ship-SLA (lib/seller-sla.ts): days a seller has to ship a
  // CONFIRMED/PROCESSING sub-order before it auto-cancels (refund-if-paid,
  // restock, both sides notified). The seller is warned one day before the
  // deadline. 0 turns the sweep off.
  seller_ship_days: number;
  // Driver reliability gate (lib/courier-reliability.ts): a courier whose
  // 90-day offer acceptance rate falls below this percent — with at least
  // `driver_acceptance_min_offers` answered offers — stops receiving
  // auto-offers (manual dispatch still works, like the COD guard). 0 = off.
  // The rate also breaks ranking ties, so reliable drivers are offered first.
  driver_min_acceptance_rate: number;
  driver_acceptance_min_offers: number;
  // Flat fee (USD) Hezalli pays a courier for each completed Hezalli Express
  // delivery — accrued to the driver's earnings ledger on delivery.
  courier_delivery_fee: number;
  // Hezalli Delivery Points (partner parcel hubs — docs/DELIVERY-POINTS.md).
  // When off, sellers can't route parcels through a point. Handling fee is the
  // USD amount a point earns per delivered parcel routed through it. Max
  // attempts is when the point should return a failing parcel to the seller.
  points_enabled: boolean;
  point_handling_fee: number;
  max_delivery_attempts: number;
  // What the buyer pays to collect from a Hezalli Point themselves (PUDO).
  // Free by default — pickup removes the whole last-mile cost.
  pickup_fee: number;
  // USD the ORIGIN hub earns when a two-hop parcel is delivered (docs §16).
  point_transfer_fee: number;
  // Days without movement before a held parcel is flagged as stale.
  stale_parcel_days: number;
  // Days a PUDO parcel waits at the counter before the network prompts an RTS
  // (docs/DELIVERY-POINTS.md §20). Must be ≥ stale_parcel_days in practice.
  pickup_window_days: number;
  // Wallet top-ups (Step 19.3). Per-transaction bounds + a standing balance cap
  // that limits how much unverified users may hold; VERIFIED users get a
  // multiple of the cap (see lib/wallet-limits.ts).
  wallet_topup_min_usd: number;
  wallet_topup_max_usd: number;
  wallet_balance_cap_usd: number;
  // Wallet cashback (Step 19.5): fraction of items total credited to the
  // buyer's wallet on order completion. 0 = off (default).
  wallet_cashback_rate: number;
  // Peer-to-peer wallet transfers (Step 19.5+). LICENSED ONLY — money
  // transmission is regulated; keep false until authorized. Default off.
  wallet_p2p_enabled: boolean;
  // Bill payment & airtime top-up (Step 19.7). A provider-ready framework;
  // purchases are fulfilled manually by an admin until a biller/telco API is
  // wired. Off by default — admins enable it in Admin → Settings.
  wallet_bills_enabled: boolean;
  // Active bill/airtime fulfilment provider id (Step 19.13). "manual" = admin
  // fulfils each purchase; a registered adapter id auto-resolves it. See
  // lib/providers/bill-provider.ts.
  wallet_bills_provider: string;
  // Outflow velocity caps (Step 19.10). Ceilings on how much can LEAVE a wallet
  // (send + cash-out + bill/airtime) over rolling 24h / 30d windows, before the
  // VERIFIED multiplier. 0 = no limit. See lib/wallet-velocity.ts.
  wallet_daily_outflow_usd: number;
  wallet_monthly_outflow_usd: number;
  // COD credit control (docs/DELIVERY-POINTS.md §32, lib/cod-guard.ts). A
  // courier stops receiving new assignments while holding more unremitted COD
  // cash than driver_cash_limit (USD), or while any of it is older than
  // driver_cod_max_age_hours (FIFO — remittances settle the oldest cash
  // first). A point whose unremitted cash exceeds point_cash_limit stops
  // accepting new routing and driver cash-ins. 0 turns that check off.
  driver_cash_limit: number;
  driver_cod_max_age_hours: number;
  point_cash_limit: number;
  // Trust bonus (docs §32): a driver's cash limit grows with clean history —
  // every `trust_step_deliveries` completed deliveries add
  // `trust_step_bonus_usd` on top of the base limit, capped at
  // `trust_bonus_cap_usd`. Security deposits (admin-recorded) add 1:1 with no
  // cap. Set step or bonus to 0 to turn the history bonus off.
  trust_step_deliveries: number;
  trust_step_bonus_usd: number;
  trust_bonus_cap_usd: number;
  // Badge bonus (lib/courier-badges.ts): every QUALITY/RELIABILITY badge a
  // driver has earned (top rated, 5-star streak, first-attempt, on-time,
  // verified — delivery milestones excluded, volume is already the trust
  // bonus's job) adds `badge_bonus_usd` to their cash limit, capped at
  // `badge_bonus_cap_usd`. Set the bonus to 0 to turn the perk off.
  badge_bonus_usd: number;
  badge_bonus_cap_usd: number;
  // Priority dispatch: among equally loaded (or equally near) couriers,
  // auto-assignment offers the parcel to the one holding more quality badges.
  // Never overrides load balancing or distance — badges only break ties.
  badge_priority_dispatch: boolean;
  // Seasonal badge (e.g. a Ramadan rush): couriers who complete
  // `season_target_deliveries` between the start and end dates (inclusive,
  // YYYY-MM-DD) earn a permanent badge named `season_badge_name`. Empty name
  // or dates = no active season. Past awards keep their name via the badge id.
  season_badge_name: string;
  season_start_date: string;
  season_end_date: string;
  season_target_deliveries: number;
  // Doorstep wallet payment for COD orders (docs §39): when on, a buyer can
  // settle a COD order from their HezalliPay balance before handover, so the
  // driver/counter collects nothing. Off hides the pay button and blocks the
  // action; orders already paid stay paid.
  cod_wallet_pay_enabled: boolean;
  // The account whose HezalliPay wallet acts as "the Hezalli wallet" — the
  // destination when a courier settles collected COD cash digitally in-app
  // (lib/actions/cod-wallet-remit.ts). Identified by email so admins can point
  // it at whichever account should hold platform cash. Must be an active ADMIN.
  platform_wallet_email: string;
  // Shadi (شادي), the AI assistant. Off hides the site widget and disables the
  // chat API and messaging channels. The Gemini API key itself is stored as a
  // separate PlatformSetting row ("gemini_api_key", managed in Admin →
  // Settings) — deliberately NOT part of this object, so the secret never
  // rides along when pages pass the settings around. lib/ai/gemini.ts reads it.
  ai_assistant_enabled: boolean;
  // Shadi's face: the image shown on the chat launcher bubble and inside the
  // widget. A public path or URL; admins change it from Admin → Shadi
  // (upload or reset). Empty falls back to the bundled default.
  ai_assistant_avatar: string;
  // ── Shadi tuning (Admin → Shadi page). For every "" / 0 value the runtime
  // falls back to the matching env var, then to the built-in default — so a
  // fresh install behaves exactly as before an admin touches anything. ──
  // Gemini chat model id (fallback: GEMINI_MODEL env → gemini-2.5-flash).
  ai_gemini_model: string;
  // Messaging-channel reply style: "text" | "voice" | "both" | "match"
  // (fallback: BOT_REPLY_MODE env → text). Voice notes are always understood.
  ai_reply_mode: string;
  // Gemini TTS prebuilt voice name (fallback: BOT_TTS_VOICE env → Leda).
  ai_tts_voice: string;
  // Natural-language delivery cue prepended to TTS text (fallback:
  // BOT_TTS_STYLE env → per-locale default).
  ai_tts_style: string;
  // Cost/abuse guard overrides. 0 = use the env/default value
  // (BOT_MAX_PER_HOUR → 60, BOT_DAILY_CAP → 3000, BOT_SPEND_CAP_USD → off).
  ai_max_per_hour: number;
  ai_daily_cap: number;
  ai_spend_cap_usd: number;
  // Per-channel switches for the messaging bots. The master
  // ai_assistant_enabled toggle still gates everything.
  ai_channel_telegram: boolean;
  ai_channel_whatsapp: boolean;
};

/** The Shadi keys, managed on their own Admin → Shadi page (not the main
 * platform-settings form). */
export type AiSettingKey = Extract<keyof PlatformSettings, `ai_${string}`>;

export const SETTING_DEFAULTS: PlatformSettings = {
  platform_name: "Hezalli",
  platform_logo: "",
  commission_rate: 0.1,
  return_window_days: 7,
  return_response_days: 2,
  auto_complete_days: 3,
  min_payout_usd: 10,
  cod_enabled: true,
  maintenance_mode: false,
  express_enabled: true,
  default_express_fee: 10,
  std_eta_min_days: 3,
  std_eta_max_days: 7,
  express_eta_min_days: 1,
  express_eta_max_days: 2,
  delivery_window_days: 7,
  express_auto_assign: true,
  courier_assign_strategy: "balanced",
  courier_offer_timeout_minutes: 60,
  courier_offer_max_rounds: 3,
  job_board_enabled: false,
  job_board_window_minutes: 15,
  job_board_max_active_jobs: 10,
  board_reminder_minutes: 60,
  pickup_deadline_hours: 0,
  dispatch_hours_start: 8,
  dispatch_hours_end: 21,
  seller_ship_days: 5,
  driver_min_acceptance_rate: 0,
  driver_acceptance_min_offers: 10,
  courier_delivery_fee: 1.5,
  points_enabled: true,
  point_handling_fee: 0.5,
  max_delivery_attempts: 3,
  pickup_fee: 0,
  point_transfer_fee: 0.25,
  stale_parcel_days: 3,
  pickup_window_days: 7,
  wallet_topup_min_usd: 1,
  wallet_topup_max_usd: 500,
  wallet_balance_cap_usd: 2000,
  // Cashback to the buyer's wallet on completed orders, as a fraction of the
  // items total. Off by default (0); admins turn it on in Admin → Settings.
  wallet_cashback_rate: 0,
  wallet_p2p_enabled: false,
  wallet_bills_enabled: false,
  wallet_bills_provider: "manual",
  wallet_daily_outflow_usd: 1000,
  wallet_monthly_outflow_usd: 5000,
  driver_cash_limit: 50,
  driver_cod_max_age_hours: 24,
  point_cash_limit: 200,
  trust_step_deliveries: 20,
  trust_step_bonus_usd: 10,
  trust_bonus_cap_usd: 100,
  badge_bonus_usd: 25,
  badge_bonus_cap_usd: 100,
  badge_priority_dispatch: true,
  season_badge_name: "",
  season_start_date: "",
  season_end_date: "",
  season_target_deliveries: 30,
  cod_wallet_pay_enabled: true,
  platform_wallet_email: "admin@hezalli.com",
  ai_assistant_enabled: true,
  ai_assistant_avatar: "/shadi.jpg",
  ai_gemini_model: "",
  ai_reply_mode: "",
  ai_tts_voice: "",
  ai_tts_style: "",
  ai_max_per_hour: 0,
  ai_daily_cap: 0,
  ai_spend_cap_usd: 0,
  ai_channel_telegram: true,
  ai_channel_whatsapp: true,
};

export const SETTING_KEYS = Object.keys(
  SETTING_DEFAULTS,
) as (keyof PlatformSettings)[];

function coerce<K extends keyof PlatformSettings>(
  key: K,
  raw: unknown,
): PlatformSettings[K] {
  const def = SETTING_DEFAULTS[key];
  if (raw == null) return def;
  if (typeof def === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : def) as PlatformSettings[K];
  }
  if (typeof def === "boolean") {
    return (raw === true || raw === "true") as PlatformSettings[K];
  }
  return String(raw) as PlatformSettings[K];
}

/** All platform settings, merged over defaults. One query. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: SETTING_KEYS as string[] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...SETTING_DEFAULTS };
  for (const k of SETTING_KEYS) {
    if (byKey.has(k)) out[k] = coerce(k, byKey.get(k)) as never;
  }
  return out;
}

/** Read a single setting (targeted query) for hot paths. */
export async function getSetting<K extends keyof PlatformSettings>(
  key: K,
): Promise<PlatformSettings[K]> {
  const row = await prisma.platformSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return coerce(key, row?.value);
}
