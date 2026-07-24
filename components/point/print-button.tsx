"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

// Triggers the browser print dialog for the current page. The point shell's
// header + tab bar are `print:hidden`, so only the receipt card prints (or
// saves to PDF / shares on mobile).
export function PrintButton() {
  const t = useTranslations("Point");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold print:hidden"
    >
      <Printer className="size-4" /> {t("receiptPrint")}
    </button>
  );
}
