// Notification email preferences (pure; safe for client import). In-app
// notifications are always created; these toggles control email only.
export const NOTIF_CATEGORIES = [
  "orders",
  "shipping",
  "payments",
  "returns",
  "chat",
  "promotions",
] as const;
export type NotifCategory = (typeof NOTIF_CATEGORIES)[number];
export type NotifPrefs = Record<NotifCategory, boolean>;

const TYPE_TO_CATEGORY: Record<string, NotifCategory> = {
  ORDER: "orders",
  SHIPMENT: "shipping",
  PAYMENT: "payments",
  RETURN: "returns",
  DISPUTE: "returns",
  CHAT: "chat",
  PROMO: "promotions",
};

export function categoryOf(type: string): NotifCategory | "system" {
  return TYPE_TO_CATEGORY[type] ?? "system";
}

export function defaultPrefs(): NotifPrefs {
  return {
    orders: true,
    shipping: true,
    payments: true,
    returns: true,
    chat: true,
    promotions: true,
  };
}

export function resolvePrefs(raw: unknown): NotifPrefs {
  const prefs = defaultPrefs();
  if (raw && typeof raw === "object") {
    for (const k of NOTIF_CATEGORIES) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "boolean") prefs[k] = v;
    }
  }
  return prefs;
}

// System notifications always email; otherwise honour the category toggle.
export function isEmailEnabled(raw: unknown, type: string): boolean {
  const cat = categoryOf(type);
  if (cat === "system") return true;
  return resolvePrefs(raw)[cat];
}
