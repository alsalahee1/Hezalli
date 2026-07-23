// Weekly opening hours for a Hezalli Point (docs §42g). A pure module (no
// server imports) so the profile editor, the public directory, and the server
// action all share one shape and one "open now?" rule. Times are "HH:MM" on
// the Asia/Aden wall clock (UTC+3, no DST) — the same convention as
// lib/dispatch-hours.ts — so a hub's hours mean the same thing wherever the
// server runs.

// One day's window, or null for a closed day.
export type DayHours = { open: string; close: string } | null;
// Exactly 7 entries, index = day of week (0 = Sunday … 6 = Saturday), matching
// JS Date.getUTCDay().
export type WeeklyHours = DayHours[];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const OFFSET_MIN = 3 * 60; // Asia/Aden, UTC+3

// Validate/normalize arbitrary JSON (e.g. a Prisma Json column or form input)
// into a WeeklyHours, or null if it isn't a well-formed 7-day schedule.
export function parseWeeklyHours(value: unknown): WeeklyHours | null {
  if (!Array.isArray(value) || value.length !== 7) return null;
  const out: WeeklyHours = [];
  for (const d of value) {
    if (d === null) {
      out.push(null);
      continue;
    }
    if (typeof d !== "object") return null;
    const open = (d as Record<string, unknown>).open;
    const close = (d as Record<string, unknown>).close;
    if (typeof open !== "string" || typeof close !== "string") return null;
    if (!TIME_RE.test(open) || !TIME_RE.test(close)) return null;
    out.push({ open, close });
  }
  return out;
}

// True once the hub has published at least one open day (drives whether an
// open/closed badge is shown at all).
export function hasAnyHours(hours: WeeklyHours | null): boolean {
  return !!hours && hours.some((d) => d !== null);
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Day (0–6) and minutes-past-midnight on the Yemen wall clock.
function adenParts(now: Date): { day: number; minutes: number } {
  const t = new Date(now.getTime() + OFFSET_MIN * 60_000);
  return {
    day: t.getUTCDay(),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

// Is the hub open right now per its schedule? `open === close` means open all
// that day; `close < open` is an overnight window (e.g. 18:00 → 02:00) that
// also counts in the early hours of the next day.
export function isPointOpenNow(
  hours: WeeklyHours,
  now: Date = new Date(),
): boolean {
  const { day, minutes } = adenParts(now);
  const today = hours[day] ?? null;
  if (today) {
    const o = toMin(today.open);
    const c = toMin(today.close);
    if (o === c) return true;
    if (o < c ? minutes >= o && minutes < c : minutes >= o) return true;
  }
  // Overnight spill from yesterday's window into the early hours of today.
  const yest = hours[(day + 6) % 7] ?? null;
  if (yest) {
    const o = toMin(yest.open);
    const c = toMin(yest.close);
    if (c < o && minutes < c) return true;
  }
  return false;
}

// Today's window for display ({open,close} or null if closed today).
export function todayHours(
  hours: WeeklyHours,
  now: Date = new Date(),
): DayHours {
  return hours[adenParts(now).day] ?? null;
}
