"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

import { cn } from "@/lib/utils";
import {
  CURRENCY_ZONE_COOKIE,
  DISPLAY_CURRENCY_COOKIE,
  type DisplayCurrencyCode,
  type SelectableZone,
} from "@/lib/currency-constants";

// A buyer-facing display option: a currency, plus — for YER — which of
// Yemen's two rial markets (Sana'a old rial vs Aden new rial) to price in.
type DisplayOption = { code: DisplayCurrencyCode; zone?: SelectableZone };

const OPTIONS: DisplayOption[] = [
  { code: "YER", zone: "NORTH" },
  { code: "YER", zone: "SOUTH" },
  { code: "USD" },
  { code: "SAR" },
  { code: "AED" },
];

function optionLabel(opt: DisplayOption, locale: string): string {
  if (opt.code === "YER") {
    if (opt.zone === "NORTH")
      return locale === "ar" ? "ر.ي صنعاء" : "YER Sana'a";
    return locale === "ar" ? "ر.ي عدن" : "YER Aden";
  }
  const plain: Record<Exclude<DisplayCurrencyCode, "YER">, [string, string]> = {
    USD: ["$", "USD"],
    SAR: ["ر.س", "SAR"],
    AED: ["د.إ", "AED"],
  };
  const [ar, en] = plain[opt.code];
  return locale === "ar" ? ar : en;
}

function applyOption(opt: DisplayOption) {
  const year = 31536000;
  document.cookie = `${DISPLAY_CURRENCY_COOKIE}=${opt.code}; path=/; max-age=${year}; SameSite=Lax`;
  if (opt.zone) {
    document.cookie = `${CURRENCY_ZONE_COOKIE}=${opt.zone}; path=/; max-age=${year}; SameSite=Lax`;
  }
}

/**
 * Shared state pattern: the header renders several currency controls
 * (desktop row, mobile menu, wallet banner). After any of them sets the
 * cookies and refreshes, the server re-renders with new initial props — each
 * instance adopts them so they never disagree.
 */
function useCurrentOption(
  initialCurrency: DisplayCurrencyCode,
  initialZone?: SelectableZone,
) {
  const [current, setCurrent] = useState<DisplayOption>({
    code: initialCurrency,
    zone: initialCurrency === "YER" ? initialZone : undefined,
  });
  useEffect(
    () =>
      setCurrent({
        code: initialCurrency,
        zone: initialCurrency === "YER" ? initialZone : undefined,
      }),
    [initialCurrency, initialZone],
  );
  return [current, setCurrent] as const;
}

/** Full switcher: both rial markets + USD/SAR/AED as a segmented row. */
export function CurrencySwitcher({
  initialCurrency,
  initialZone,
  locale,
}: {
  initialCurrency: DisplayCurrencyCode;
  // Effective rial market ("NORTH" | "SOUTH") the server resolved.
  initialZone?: SelectableZone;
  locale: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useCurrentOption(initialCurrency, initialZone);

  const isActive = (opt: DisplayOption) =>
    opt.code === current.code &&
    (opt.code !== "YER" || opt.zone === current.zone);

  const switchTo = (opt: DisplayOption) => {
    if (isActive(opt)) return;
    setCurrent(opt);
    applyOption(opt);
    // Price labels are server-rendered; refresh re-resolves the rate.
    router.refresh();
  };

  return (
    <div className="flex items-center overflow-hidden rounded-md border text-xs font-medium">
      {OPTIONS.map((opt) => (
        <button
          key={`${opt.code}-${opt.zone ?? ""}`}
          type="button"
          onClick={() => switchTo(opt)}
          aria-current={isActive(opt)}
          className={cn(
            "px-2 py-1 whitespace-nowrap transition-colors",
            isActive(opt)
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {optionLabel(opt, locale)}
        </button>
      ))}
    </div>
  );
}

/**
 * Corner button: one compact pill showing the active rial market next to a
 * swap icon. Each press flips between Yemen's two rials — Sana'a (old) ⇄
 * Aden (new). If the buyer is on USD/SAR/AED, the first press returns to
 * rial in their current market. Other currencies stay in the full switcher.
 */
export function CurrencyToggleButton({
  initialCurrency,
  initialZone,
  locale,
}: {
  initialCurrency: DisplayCurrencyCode;
  initialZone?: SelectableZone;
  locale: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useCurrentOption(initialCurrency, initialZone);

  const flip = () => {
    const zone: SelectableZone =
      current.code === "YER"
        ? current.zone === "NORTH"
          ? "SOUTH"
          : "NORTH"
        : (initialZone ?? "SOUTH");
    const next: DisplayOption = { code: "YER", zone };
    setCurrent(next);
    applyOption(next);
    router.refresh();
  };

  const label = optionLabel(current, locale);

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:text-foreground hover:bg-muted bg-background/80 inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors"
    >
      <ArrowLeftRight className="size-3.5" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
