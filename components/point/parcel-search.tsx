"use client";

import { useState } from "react";
import { QrCode, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { QrScanSheet } from "@/components/ui/qr-scan-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Pull the tracking token out of whatever the QR encoded: a full tracking URL
// (…/track/YE123) or a bare tracking number.
function extractTracking(raw: string): string {
  const s = raw.trim();
  const m = s.match(/\/track\/([^/?#]+)/i);
  return decodeURIComponent(m ? m[1] : s);
}

// Counter search: jump to a parcel's detail page by tracking number (or a
// pasted shipment id). Pure navigation — the detail route resolves the code
// and guards that the parcel actually involves this hub. Scanning the parcel
// label's QR is the fast path; typing stays as the fallback.
export function ParcelSearch() {
  const t = useTranslations("Point");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const open = (code: string) => {
    const c = code.trim();
    if (c) router.push(`/point/parcel/${encodeURIComponent(c)}`);
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          open(q);
        }}
        className="flex gap-2"
        role="search"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          dir="ltr"
        />
        {/* Scan the parcel label instead of reading its tracking number. */}
        <Button
          type="button"
          variant="outline"
          onClick={() => setScanOpen(true)}
          aria-label={t("searchScanBtn")}
          className="shrink-0"
        >
          <QrCode className="size-4" /> {t("searchScanBtn")}
        </Button>
        <Button
          type="submit"
          aria-label={t("searchGo")}
          className="shrink-0"
          disabled={!q.trim()}
        >
          <Search className="size-4" /> {t("searchGo")}
        </Button>
      </form>

      <QrScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title={t("searchScanTitle")}
        scanHint={t("searchScanHint")}
        startingLabel={t("startingCamera")}
        cameraUnavailableLabel={t("cameraUnavailable")}
        manualLabel={t("searchScanManualLabel")}
        manualPlaceholder="YE123456789"
        manualSubmitLabel={t("searchGo")}
        closeLabel={t("close")}
        busyLabel={t("startingCamera")}
        onScan={async (raw) => {
          const code = extractTracking(raw);
          if (!code) return t("cameraUnavailable");
          setScanOpen(false);
          open(code);
          return null;
        }}
      />
    </>
  );
}
