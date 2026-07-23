// Where "my dashboard" lives for a given user, by role priority. Shared by the
// storefront header, the wallet app header, and any other surface that offers
// a quick hop to the user's own panel. Buyers with no operational role land on
// their account page — that IS their dashboard.
export type DashboardRoleFlags = {
  isAdmin?: boolean;
  isSeller?: boolean;
  isCourier?: boolean;
  isPointOperator?: boolean;
  isFleetOwner?: boolean;
};

export function dashboardHref(f: DashboardRoleFlags): string {
  if (f.isAdmin) return "/admin";
  if (f.isSeller) return "/seller";
  if (f.isCourier) return "/driver";
  if (f.isPointOperator) return "/point";
  if (f.isFleetOwner) return "/fleet";
  return "/account";
}
