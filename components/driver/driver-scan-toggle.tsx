"use client";

import { useState } from "react";
import { QrCode as QrIcon, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { QrScanner } from "@/components/driver/qr-scanner";

type Mode = "scan" | "code";

/**
 * Segmented "scan parcel" / "my code" toggle, mirroring the wallet's scan
 * sheet (components/wallet/wallet-scan-sheet.tsx): a full content swap
 * instead of stacking the QR below the scanner.
 */
export function DriverScanToggle({ myQr }: { myQr: React.ReactNode }) {
  const t = useTranslations("Driver");
  const [mode, setMode] = useState<Mode>("scan");

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-4">
      <div className="bg-muted/60 mx-auto flex max-w-sm rounded-full p-1">
        <button
          type="button"
          onClick={() => setMode("scan")}
          className={tabClass(mode === "scan")}
        >
          <ScanLine className="size-4" /> {t("scan")}
        </button>
        <button
          type="button"
          onClick={() => setMode("code")}
          className={tabClass(mode === "code")}
        >
          <QrIcon className="size-4" /> {t("myQrTab")}
        </button>
      </div>

      {mode === "scan" ? (
        <QrScanner />
      ) : (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-2">
          <div className="rounded-2xl border bg-white p-4">{myQr}</div>
          <p className="text-muted-foreground max-w-xs text-center text-sm">
            {t("myQrHint")}
          </p>
        </div>
      )}
    </div>
  );
}
