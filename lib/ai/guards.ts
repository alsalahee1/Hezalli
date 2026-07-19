// DB-backed cost + abuse guards for the messaging-channel bots, adapted from
// the GoldenPrint bot's three-layer model:
//   1. per-user hourly rate limit  (a spammer/loop can't flood one chat)
//   2. global daily message cap     (backstop on total volume)
//   3. monthly spend cap            (hard ceiling on the Gemini bill)
// Pure logic + tunables live in guards-core.ts; this file adds the Prisma I/O.
import "server-only";

import { prisma } from "@/lib/prisma";

import type { TokenUsage } from "./gemini";
import {
  DAILY_CAP,
  dayKey,
  estimateCostUsd,
  estimateTtsUsd,
  monthKey,
  SPEND_CAP_USD,
  type GuardReason,
} from "./guards-core";

export { checkRate, estimateCostUsd } from "./guards-core";
export type { GuardReason, RateResult } from "./guards-core";

/** Check the global daily cap and the monthly spend cap (both read-only). */
export async function checkGlobalCaps(
  now: number,
): Promise<{ ok: true } | { ok: false; reason: GuardReason }> {
  const today = await prisma.botDailyUsage.findUnique({
    where: { day: dayKey(now) },
    select: { messages: true },
  });
  if ((today?.messages ?? 0) >= DAILY_CAP)
    return { ok: false, reason: "daily" };

  if (SPEND_CAP_USD > 0 && (await monthSpendUsd(now)) >= SPEND_CAP_USD) {
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
