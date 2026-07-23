"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
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

function setCurrencyCookie(next: DisplayCurrencyCode) {
  document.cookie = `${DISPLAY_CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * Shared state pattern: the header renders several currency controls
 * (desktop row, mobile corner button, mobile menu, wallet bar). After any of
 * them sets the cookie and refreshes, the server re-renders with a new
 * initialCurrency — each instance adopts it so they never disagree.
 */
function useCurrentCurrency(initialCurrency: DisplayCurrencyCode) {
  const [current, setCurrent] = useState(initialCurrency);
  useEffect(() => setCurrent(initialCurrency), [initialCurrency]);
  return [current, setCurrent] as const;
}

/** Full switcher: all four display currencies as a segmented row. */
export function CurrencySwitcher({
  initialCurrency,
  locale,
}: {
  initialCurrency: DisplayCurrencyCode;
  locale: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useCurrentCurrency(initialCurrency);

  const switchTo = (next: DisplayCurrencyCode) => {
    if (next === current) return;
    setCurrent(next);
    setCurrencyCookie(next);
    // Price labels are server-rendered; refresh re-resolves the rate.
    router.refresh();
  };

  return (
    <div className="flex items-center overflow-hidden rounded-md border text-xs font-medium">
      {DISPLAY_CURRENCIES.map((code) => (
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

/**
 * Corner button: one compact pill showing the active currency next to a swap
 * icon. Each press flips between the everyday YER/USD pair (from SAR/AED the
 * first press lands on YER); the full 4-currency row stays available in the
 * mobile menu and on desktop.
 */
export function CurrencyToggleButton({
  initialCurrency,
  locale,
}: {
  initialCurrency: DisplayCurrencyCode;
  locale: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useCurrentCurrency(initialCurrency);

  const flip = () => {
    const next: DisplayCurrencyCode = current === "YER" ? "USD" : "YER";
    setCurrent(next);
    setCurrencyCookie(next);
    router.refresh();
  };

  const label = locale === "ar" ? LABELS[current].ar : LABELS[current].en;

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors"
    >
      <ArrowLeftRight className="size-3.5" aria-hidden />
      <span dir="ltr">{label}</span>
    </button>
  );
}
