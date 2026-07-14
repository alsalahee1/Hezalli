import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Arabic is the default (RTL); English is the secondary (LTR).
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
