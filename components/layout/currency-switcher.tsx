"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, ChevronDown } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

import { cn } from "@/lib/utils";
import { Popover } from "@/components/ui/popover";
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

/** Full switcher: a dropdown listing both rial markets plus USD/SAR/AED. */
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
  const [open, setOpen] = useState(false);

  const isActive = (opt: DisplayOption) =>
    opt.code === current.code &&
    (opt.code !== "YER" || opt.zone === current.zone);

  const switchTo = (opt: DisplayOption) => {
    setOpen(false);
    if (isActive(opt)) return;
    setCurrent(opt);
    applyOption(opt);
    // Price labels are server-rendered; refresh re-resolves the rate.
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors"
      >
        {optionLabel(current, locale)}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </button>

      <Popover open={open} onClose={() => setOpen(false)}>
        {(shown) => (
          <ul
            role="listbox"
            className={cn(
              "bg-background absolute end-0 z-50 mt-2 w-36 origin-top-right overflow-hidden rounded-md border p-1 shadow-lg transition duration-200 ease-out will-change-transform motion-reduce:transition-none rtl:origin-top-left",
              shown ? "scale-100 opacity-100" : "scale-95 opacity-0",
            )}
          >
            {OPTIONS.map((opt) => {
              const active = isActive(opt);
              return (
                <li key={`${opt.code}-${opt.zone ?? ""}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => switchTo(opt)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-start text-xs font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {optionLabel(opt, locale)}
                    {active ? (
                      <Check className="size-3.5 shrink-0" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Popover>
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
