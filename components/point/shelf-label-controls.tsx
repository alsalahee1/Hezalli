"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrintButton } from "@/components/point/print-button";

// Rows/bays chooser for the shelf-label sheet. Pushes the new grid size into
// the URL so the server page re-renders the QR grid; hidden when printing so
// only the labels hit the paper.
export function ShelfLabelControls({
  rows,
  bays,
}: {
  rows: number;
  bays: number;
}) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [r, setR] = useState(String(rows));
  const [b, setB] = useState(String(bays));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(
          `/point/labels?rows=${Number(r) || 1}&bays=${Number(b) || 1}`,
        );
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border p-3 print:hidden"
    >
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground block text-xs font-medium">
          {t("labelsRows")}
        </span>
        <Input
          type="number"
          min={1}
          max={12}
          value={r}
          onChange={(e) => setR(e.target.value)}
          dir="ltr"
          className="w-24"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground block text-xs font-medium">
          {t("labelsBays")}
        </span>
        <Input
          type="number"
          min={1}
          max={20}
          value={b}
          onChange={(e) => setB(e.target.value)}
          dir="ltr"
          className="w-24"
        />
      </label>
      <Button type="submit" variant="outline">
        <RefreshCw className="size-4" /> {t("labelsUpdate")}
      </Button>
      <PrintButton />
    </form>
  );
}
