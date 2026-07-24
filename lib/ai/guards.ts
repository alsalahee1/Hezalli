// DB-backed cost + abuse guards for the messaging-channel bots, adapted from
// the GoldenPrint bot's three-layer model:
//   1. per-user hourly rate limit  (a spammer/loop can't flood one chat)
//   2. global daily message cap     (backstop on total volume)
//   3. monthly spend cap            (hard ceiling on the Gemini bill)
// Pure logic + tunables live in guards-core.ts; this file adds the Prisma I/O.
import "server-only";

import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

import type { TokenUsage } from "./gemini";
import {
  DAILY_CAP,
  dayKey,
  estimateCostUsd,
  estimateTtsUsd,
  MAX_PER_HOUR,
  monthKey,
  SPEND_CAP_USD,
  type GuardReason,
} from "./guards-core";

export { checkRate, estimateCostUsd } from "./guards-core";
export type { GuardReason, RateResult } from "./guards-core";

// Admin-tunable guard values (Admin → Assistant). A 0/unset setting falls back to
// the env-derived default from guards-core, so nothing changes until an admin
// dials in a value.
export async function getMaxPerHour(): Promise<number> {
  try {
    const v = await getSetting("ai_max_per_hour");
    if (v > 0) return v;
  } catch {
    // fall through
  }
  return MAX_PER_HOUR;
}

export async function getDailyCap(): Promise<number> {
  try {
    const v = await getSetting("ai_daily_cap");
    if (v > 0) return v;
  } catch {
    // fall through
  }
  return DAILY_CAP;
}

export async function getSpendCapUsd(): Promise<number> {
  try {
    const v = await getSetting("ai_spend_cap_usd");
    if (v > 0) return v;
  } catch {
    // fall through
  }
  return SPEND_CAP_USD;
}

/** Check the global daily cap and the monthly spend cap (both read-only). */
export async function checkGlobalCaps(
  now: number,
): Promise<{ ok: true } | { ok: false; reason: GuardReason }> {
  const today = await prisma.botDailyUsage.findUnique({
    where: { day: dayKey(now) },
    select: { messages: true },
  });
  if ((today?.messages ?? 0) >= (await getDailyCap()))
    return { ok: false, reason: "daily" };

  const spendCap = await getSpendCapUsd();
  if (spendCap > 0 && (await monthSpendUsd(now)) >= spendCap) {
    return { ok: false, reason: "spend" };
  }
  return { ok: true };
}

/** Estimated Gemini spend (USD) so far this calendar month (text + TTS). */
export async function monthSpendUsd(now: number): Promise<number> {
  const rows = await prisma.botDailyUsage.findMany({
    where: { day: { startsWith: monthKey(now) } },
    select: { tokensIn: true, tokensOut: true, ttsTokens: true },
  });
  return rows.reduce(
    (sum, r) =>
      sum +
      estimateCostUsd(r.tokensIn, r.tokensOut) +
      estimateTtsUsd(r.ttsTokens),
    0,
  );
}

/** Increment today's global counters after a completed turn. */
export async function recordDailyUsage(
  usage: TokenUsage,
  now: number,
): Promise<void> {
  const day = dayKey(now);
  await prisma.botDailyUsage.upsert({
    where: { day },
    create: { day, messages: 1, tokensIn: usage.in, tokensOut: usage.out },
    update: {
      messages: { increment: 1 },
      tokensIn: { increment: usage.in },
      tokensOut: { increment: usage.out },
    },
  });
}

/** Add TTS (audio) output tokens to today's usage, for the spend estimate/cap. */
export async function recordTtsUsage(
  ttsTokens: number,
  now: number,
): Promise<void> {
  if (ttsTokens <= 0) return;
  const day = dayKey(now);
  await prisma.botDailyUsage.upsert({
    where: { day },
    create: { day, ttsTokens },
    update: { ttsTokens: { increment: ttsTokens } },
  });
}
