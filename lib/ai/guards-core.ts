// Pure, dependency-free cost-guard logic (no server-only / no Prisma) so it can
// be unit-tested and shared. The DB-backed wrappers live in lib/ai/guards.ts.

const HOUR_MS = 3_600_000;

export const MAX_PER_HOUR = Number(process.env.BOT_MAX_PER_HOUR) || 60;
export const DAILY_CAP = Number(process.env.BOT_DAILY_CAP) || 3000;
export const SPEND_CAP_USD = Number(process.env.BOT_SPEND_CAP_USD) || 0; // 0 = off

// Rough gemini-2.5-flash text pricing (USD per 1M tokens). Override via env if
// you switch models or want the estimate to track real billing.
const PRICE_IN_PER_M = Number(process.env.GEMINI_PRICE_IN_PER_M) || 0.3;
const PRICE_OUT_PER_M = Number(process.env.GEMINI_PRICE_OUT_PER_M) || 2.5;

export type GuardReason = "rate" | "daily" | "spend";
export type RateResult = { ok: boolean; hits: number[] };

export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  return (
    (tokensIn / 1_000_000) * PRICE_IN_PER_M +
    (tokensOut / 1_000_000) * PRICE_OUT_PER_M
  );
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
export function monthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7); // YYYY-MM (UTC)
}

/**
 * Slide the hourly window over `prior` timestamps and decide if this request is
 * allowed. Returns the trimmed+updated hit list to persist on the chat row.
 */
export function checkRate(prior: unknown, now: number): RateResult {
  const hits = (Array.isArray(prior) ? prior : [])
    .filter((t): t is number => typeof t === "number")
    .filter((t) => now - t < HOUR_MS);
  if (hits.length >= MAX_PER_HOUR) return { ok: false, hits };
  hits.push(now);
  return { ok: true, hits };
}
