"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

// Localized 404 shown for any notFound() inside a locale route. Rendered within
// the [locale] layout, so it inherits the NextIntlClientProvider + dir/RTL.
export default function LocaleNotFound() {
  const t = useTranslations("Errors");
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-primary text-6xl font-bold">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("notFoundTitle")}
      </h1>
      <p className="text-muted-foreground">{t("notFoundBody")}</p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
      >
        {t("backHome")}
      </Link>
    </main>
  );
}
