// Scheduled delivery windows for Hezalli Express. A window is a preferred
// delivery DAY plus a time-of-day SLOT. It's a soft buyer preference captured at
// checkout and surfaced to dispatch + the courier — nothing enforces it.
//
// The day is stored as a date-only column (Order.deliveryDate, @db.Date) so it
// carries no timezone/hour component; render it in UTC to avoid day drift.

export const DELIVERY_SLOTS = ["MORNING", "AFTERNOON", "EVENING"] as const;
export type DeliverySlot = (typeof DELIVERY_SLOTS)[number];

export function isDeliverySlot(v: unknown): v is DeliverySlot {
  return (
    typeof v === "string" && (DELIVERY_SLOTS as readonly string[]).includes(v)
  );
}

export type DeliveryWindow = { date: Date; slot: DeliverySlot };

// Midnight-UTC timestamp for a Date's calendar day.
function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Parse + validate a buyer's requested window. Date and slot must be supplied
 * together. The date is a `YYYY-MM-DD` string and must fall between tomorrow and
 * `maxDays` ahead (inclusive), in UTC.
 *
 * Returns:
 *  - the normalized window (date pinned to UTC midnight) when valid,
 *  - `null` when the buyer requested no window (both fields empty),
 *  - `"invalid"` when the input is half-filled, malformed, or out of range.
 */
export function parseDeliveryWindow(
  dateStr: string | null | undefined,
  slot: string | null | undefined,
  maxDays: number,
): DeliveryWindow | null | "invalid" {
  const rawDate = dateStr?.trim() ?? "";
  const rawSlot = slot?.trim() ?? "";
  if (!rawDate && !rawSlot) return null; // no preference
  if (!rawDate || !rawSlot) return "invalid"; // only one half supplied
  if (!isDeliverySlot(rawSlot)) return "invalid";
  if (!Number.isFinite(maxDays) || maxDays <= 0) return "invalid"; // scheduling off

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
  if (!m) return "invalid";
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject impossible calendar dates (e.g. 2026-02-30 rolls over).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "invalid";
  }

  const today = utcDay(new Date());
  const dayMs = 86_400_000;
  const earliest = today + dayMs; // tomorrow, at the earliest
  const latest = today + Math.floor(maxDays) * dayMs;
  const t = date.getTime();
  if (t < earliest || t > latest) return "invalid";

  return { date, slot: rawSlot };
}

// `YYYY-MM-DD` bounds for a native <input type="date"> given the horizon.
// Returns null when scheduling is disabled (maxDays <= 0).
export function deliveryWindowBounds(
  maxDays: number,
): { min: string; max: string } | null {
  if (!Number.isFinite(maxDays) || maxDays <= 0) return null;
  const today = utcDay(new Date());
  const dayMs = 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    min: iso(today + dayMs),
    max: iso(today + Math.floor(maxDays) * dayMs),
  };
}
