"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";

import { cn } from "@/lib/utils";
import {
  DISPLAY_CURRENCIES,
  DISPLAY_CURRENCY_COOKIE,
  type DisplayCurrencyCode,
} from "@/lib/currency-constants";

const LABELS: Record<DisplayCurrencyCode, { ar: string; en: string }> = {
  YER: { ar: "ر.ي", en: "YER" },
  USD: { ar: "$", en: "USD" },
  SAR: { ar: "ر.س", en: "SAR" },
  AED: { ar: "د.إ", en: "AED" },
};

// The everyday pair for Yemeni buyers. The compact variant shows only these
// two; SAR/AED stay reachable from the full variant (mobile menu / desktop).
const TOGGLE_PAIR: readonly DisplayCurrencyCode[] = ["YER", "USD"];

export function CurrencySwitcher({
  initialCurrency,
  locale,
  variant = "full",
}: {
  initialCurrency: DisplayCurrencyCode;
  locale: string;
  // "toggle" = compact one-tap YER⇄USD pair for the always-visible mobile
  // header row; "full" = all four display currencies.
  variant?: "full" | "toggle";
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(initialCurrency);

  // The header renders several switcher instances (desktop row, mobile row,
  // mobile menu). After one of them sets the cookie and refreshes, the server
  // re-renders with a new initialCurrency — adopt it so they stay in sync.
  useEffect(() => setCurrent(initialCurrency), [initialCurrency]);

  const switchTo = (next: DisplayCurrencyCode) => {
    if (next === current) return;
    setCurrent(next);
    document.cookie = `${DISPLAY_CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    // Price labels are server-rendered; refresh re-resolves the rate.
    router.refresh();
  };

  const codes = variant === "toggle" ? TOGGLE_PAIR : DISPLAY_CURRENCIES;

  return (
    <div className="flex items-center overflow-hidden rounded-md border text-xs font-medium">
      {codes.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchTo(code)}
          aria-current={current === code}
          className={cn(
            "px-2 py-1 transition-colors",
            current === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {locale === "ar" ? LABELS[code].ar : LABELS[code].en}
        </button>
      ))}
    </div>
  );
}
