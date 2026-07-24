// Delivery-ops team desks. /delivery-manager used to be one all-powerful role;
// it is now a team, where each member holds a set of DESK scopes. This module
// is pure — no server imports — so the client shell can share the exact desk
// map the server layout and action gates enforce. See lib/authz.ts for the
// gates and app/[locale]/admin/delivery-team for granting scopes.

// The storable desks, mirroring the Prisma DeliveryScope enum.
export const DELIVERY_SCOPES = [
  "DISPATCH",
  "FLEET",
  "POINTS",
  "SETTLEMENT",
  "NETWORK",
] as const;
export type DeliveryScope = (typeof DELIVERY_SCOPES)[number];

export function isDeliveryScope(v: string): v is DeliveryScope {
  return (DELIVERY_SCOPES as readonly string[]).includes(v);
}

// What a delivery-team member may reach: the concrete set of desks, or "ALL"
// for a Head of Delivery (empty stored scopes) or an ADMIN. Resolve a stored
// scope list into this with resolveDeliveryAccess().
export type DeliveryAccess = { scopes: Set<DeliveryScope> } | "ALL";

// Empty stored scopes = Head of Delivery = every desk. This keeps every
// pre-existing DELIVERY_MANAGER account (which has no scopes) at full access.
export function resolveDeliveryAccess(
  stored: readonly string[],
): DeliveryAccess {
  const desks = stored.filter(isDeliveryScope);
  if (desks.length === 0) return "ALL";
  return { scopes: new Set(desks) };
}

export function accessHasScope(
  access: DeliveryAccess,
  scope: DeliveryScope,
): boolean {
  return access === "ALL" || access.scopes.has(scope);
}

// Which desk a nav key belongs to. `null` = always shown to any team member
// (the dashboard landing and the how-to guide). Keys match DELIVERY_MANAGER_NAV
// in components/layout/dashboard-shell.tsx.
export const NAV_KEY_SCOPE: Record<string, DeliveryScope | null> = {
  dashboard: null,
  how: null,
  dispatch: "DISPATCH",
  scan: "DISPATCH",
  shipments: "DISPATCH",
  couriers: "FLEET",
  fleets: "FLEET",
  vehicleCapacity: "FLEET",
  points: "POINTS",
  cash: "SETTLEMENT",
  remittances: "SETTLEMENT",
  carriers: "NETWORK",
  shippingZones: "NETWORK",
  deliveryDefaults: "NETWORK",
};

// Nav keys a member may see, given their access. Always-on keys (null scope)
// stay; the rest survive only if the member holds that desk.
export function visibleNavKeys(access: DeliveryAccess): string[] {
  return Object.entries(NAV_KEY_SCOPE)
    .filter(([, scope]) => scope === null || accessHasScope(access, scope))
    .map(([key]) => key);
}
