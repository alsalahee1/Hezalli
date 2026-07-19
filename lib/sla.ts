// Delivery SLA helpers for Hezalli Express. A parcel's "due by" is when its
// promised delivery window closes (shippedAt + the tier's max ETA). Ops use the
// resulting state to chase parcels before the promise is missed.
export type SlaState = "on_track" | "due_soon" | "overdue";

// A parcel counts as "due soon" once it's within this window of its deadline.
export const DUE_SOON_MS = 12 * 60 * 60 * 1000;

/** The moment a parcel's promised delivery window closes. */
export function dueBy(shippedAt: Date, etaMaxDays: number): Date {
  return new Date(shippedAt.getTime() + etaMaxDays * 86_400_000);
}

/** Where a not-yet-delivered parcel sits relative to its deadline. */
export function slaState(due: Date, now: Date): SlaState {
  const remaining = due.getTime() - now.getTime();
  if (remaining <= 0) return "overdue";
  if (remaining <= DUE_SOON_MS) return "due_soon";
  return "on_track";
}

// Sort weight so overdue parcels bubble to the top, then due-soon.
const WEIGHT: Record<SlaState, number> = {
  overdue: 0,
  due_soon: 1,
  on_track: 2,
};
export function slaWeight(state: SlaState): number {
  return WEIGHT[state];
}
