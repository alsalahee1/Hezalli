// Pure order-status helpers shared by buyer/seller order screens.

export const ORDER_TABS = [
  "all",
  "topay",
  "toship",
  "toreceive",
  "completed",
  "cancelled",
] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export function statusToTab(status: string): OrderTab {
  switch (status) {
    case "PENDING":
      return "topay";
    case "CONFIRMED":
    case "PROCESSING":
      return "toship";
    case "SHIPPED":
    case "DELIVERED":
      return "toreceive";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
    case "REFUNDED":
      return "cancelled";
    default:
      return "all";
  }
}

export const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-600",
  CONFIRMED: "bg-blue-500/15 text-blue-600",
  PROCESSING: "bg-blue-500/15 text-blue-600",
  SHIPPED: "bg-indigo-500/15 text-indigo-600",
  DELIVERED: "bg-emerald-500/15 text-emerald-600",
  COMPLETED: "bg-emerald-500/15 text-emerald-600",
  CANCELLED: "bg-destructive/10 text-destructive",
  REFUNDED: "bg-muted text-muted-foreground",
  RETURNED: "bg-muted text-muted-foreground",
};

// A buyer may cancel only before the order ships.
export function canBuyerCancel(status: string): boolean {
  return (
    status === "PENDING" || status === "CONFIRMED" || status === "PROCESSING"
  );
}
