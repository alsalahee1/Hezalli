// Pure notification helpers safe to import from client components (no server
// deps). The server-side notify() helper lives in lib/notify.ts.
export type NotifVariant = "buyer" | "seller" | "admin";

// Resolve a notification's click target for the given app area. A stored
// `data.link` always wins; otherwise we route by the ids present.
export function notificationHref(variant: NotifVariant, data: unknown): string {
  const d = (data ?? {}) as Record<string, string | undefined>;
  if (typeof d.link === "string" && d.link.startsWith("/")) return d.link;

  if (variant === "admin") {
    if (d.disputeId) return `/admin/disputes/${d.disputeId}`;
    if (d.payoutId) return "/admin/payouts";
    if (d.reviewId) return "/admin/reviews";
    if (d.orderId) return `/admin/orders/${d.orderId}`;
    return "/admin";
  }
  if (variant === "seller") {
    if (d.returnId || d.disputeId) return "/seller/returns";
    if (d.payoutId) return "/seller/finance";
    if (d.orderId) return "/seller/orders";
    return "/seller";
  }
  // buyer
  if (d.orderId) return `/account/orders/${d.orderId}`;
  return "/account/notifications";
}
