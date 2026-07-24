"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

// Triggers the browser print dialog for the current page. The point shell's
// header + tab bar are `print:hidden`, so only the receipt card prints (or
// saves to PDF / shares on mobile).
export function PrintButton() {
  const t = useTranslations("Point");
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="rounded-full print:hidden"
    >
      <Printer className="size-4" /> {t("receiptPrint")}
    </Button>
  );
}
