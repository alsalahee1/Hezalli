// Dispatch working hours (docs/EXPRESS-DELIVERY.md). Orders arrive around the
// clock, but drivers and points work daytime shifts — so auto-dispatch only
// offers parcels inside the configured window, everything else queues for the
// first sweep after opening, and offer clocks never expire overnight. All of
// Hezalli's operations are in Yemen, so hours are interpreted on the Asia/Aden
// wall clock (UTC+3, no DST) regardless of where the server runs.
const DISPATCH_UTC_OFFSET_HOURS = 3;

/** The current hour (0–23) on the Yemen wall clock. */
export function dispatchLocalHour(now: Date = new Date()): number {
  return (now.getUTCHours() + DISPATCH_UTC_OFFSET_HOURS) % 24;
}

/**
 * Whether the dispatch window is open. `start === end` means 24/7 dispatch;
 * `end < start` is an overnight window (e.g. 20 → 6).
 */
export function isDispatchOpen(
  start: number,
  end: number,
  now: Date = new Date(),
): boolean {
  if (start === end) return true;
  const h = dispatchLocalHour(now);
  return start < end ? h >= start && h < end : h >= start || h < end;
}
