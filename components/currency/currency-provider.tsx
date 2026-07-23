"use client";

import { createContext, useCallback, useContext } from "react";
import { useLocale } from "next-intl";

import {
  formatMoney,
  USD_DISPLAY,
  type DisplayCurrency,
} from "@/lib/currency-constants";

// Server layouts resolve the buyer's display currency (cookie + address
// zone, lib/currency.ts) once per request and mount it here so client
// components format stored-USD amounts without their own fetches.
const CurrencyContext = createContext<DisplayCurrency>(USD_DISPLAY);

export function CurrencyProvider({
  value,
  children,
}: {
  value: DisplayCurrency;
  children: React.ReactNode;
}) {
  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useDisplayCurrency(): DisplayCurrency {
  return useContext(CurrencyContext);
}

/** Formatter from stored USD to the buyer's display currency. */
export function useMoney(): (usd: number) => string {
  const display = useContext(CurrencyContext);
  const locale = useLocale();
  return useCallback(
    (usd: number) => formatMoney(usd, display, locale),
    [display, locale],
  );
}
