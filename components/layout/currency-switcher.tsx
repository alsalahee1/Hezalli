"use client";

import { useState } from "react";
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

export function CurrencySwitcher({
  initialCurrency,
  locale,
}: {
  initialCurrency: DisplayCurrencyCode;
  locale: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(initialCurrency);

  const switchTo = (next: DisplayCurrencyCode) => {
    if (next === current) return;
    setCurrent(next);
    document.cookie = `${DISPLAY_CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
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
