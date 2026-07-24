// Multi-location branch selection (docs §42j). An owner may run several
// branches; the one they're currently operating is remembered in a cookie so
// every point action/page scopes to it. Staff always resolve to their single
// hub and never read this. Kept tiny and dependency-light so it can be shared
// by the gate, the layout, and the switch action.
export const POINT_BRANCH_COOKIE = "point_branch";

// Pick the active branch id from the owner's ACTIVE points given the cookie:
// the cookie's branch if it's still one of theirs, else the first (stable
// order). Returns null when they own no active branch.
export function resolveActiveBranch<T extends { id: string }>(
  activePoints: T[],
  cookieValue: string | undefined,
): T | null {
  if (activePoints.length === 0) return null;
  return activePoints.find((p) => p.id === cookieValue) ?? activePoints[0];
}
