import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Arabic is the default (RTL); English is the secondary (LTR).
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always",
  // Always land first-time visitors on Arabic. Without this, next-intl would
  // pick the locale from the browser's Accept-Language header / saved cookie,
  // which is why an English device was landing on /en. Users can still switch
  // to English explicitly via the language switcher.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
