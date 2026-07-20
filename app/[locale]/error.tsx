"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

// Localized error boundary for locale routes. A render/data error here shows a
// styled, translated recovery screen (with a retry) instead of the default
// unstyled English fallback. Must be a Client Component per the App Router.
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");

  useEffect(() => {
    // Surfaced to the server via instrumentation.ts#onRequestError as well; log
    // client-side so it's visible in the browser console during development.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("errorTitle")}
      </h1>
      <p className="text-muted-foreground">{t("errorBody")}</p>
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
      >
        {t("retry")}
      </button>
    </main>
  );
}
