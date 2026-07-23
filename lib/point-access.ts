// Point-app access tiers (docs/DELIVERY-POINTS.md §42d). A hub is no longer a
// single login: the owner can attach employee accounts (PointStaff) with a job
// role, and every point action/page gates on what that job may do. This module
// is pure — no server imports — so the client shell (tab bar) can share the
// exact capability rules the server actions enforce.

// What requireDeliveryPoint() reports: the implicit OWNER tier, or the
// PointStaffRole of an active employee.
export type PointAccess =
  "OWNER" | "MANAGER" | "CASHIER" | "COLLECTOR" | "ORGANIZER";

// The storable job roles, mirroring the Prisma PointStaffRole enum (OWNER is
// never stored — owning the point is the grant).
export const POINT_STAFF_ROLES = [
  "MANAGER",
  "CASHIER",
  "COLLECTOR",
  "ORGANIZER",
] as const;
export type PointStaffRole = (typeof POINT_STAFF_ROLES)[number];

// Take money at the counter: buyer COD pickups and driver cash hand-ins.
// Everyone but the shelves organizer — organizers touch parcels, not cash.
export function canHandleCash(access: PointAccess): boolean {
  return access !== "ORGANIZER";
}

// See the hub's money: ledger, monthly statement, stats, remit claims. The
// cashier takes cash but doesn't audit it; the collector's whole job is
// squaring the hub's cash with Hezalli.
export function canViewMoney(access: PointAccess): boolean {
  return access === "OWNER" || access === "MANAGER" || access === "COLLECTOR";
}

// Run the shop: hire/fire staff and toggle vacation mode.
export function canManagePoint(access: PointAccess): boolean {
  return access === "OWNER" || access === "MANAGER";
}

// Move the point's earnings out (payout requests, earnings→wallet moves).
// Owner only: these actions pay the OWNER, so no employee may trigger them.
export function canMoveEarnings(access: PointAccess): boolean {
  return access === "OWNER";
}
