"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

// Downloads a server-rendered PDF of a document (invoice / packing slip /
// shipping label). Generation runs headless Chromium on the server, so it
// takes a couple of seconds — show a spinner while it works.
export function DownloadPdfButton({
  type,
  id,
  locale,
  label,
}: {
  type: "invoice" | "packing-slip" | "shipping-label";
  id: string;
  locale: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/pdf?type=${type}&id=${encodeURIComponent(id)}&locale=${locale}`,
      );
      if (!res.ok) throw new Error(`PDF request failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-${id.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fall back to the browser print dialog if generation fails.
      window.print();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={download}
      disabled={busy}
      className="print:hidden"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      {label}
    </Button>
  );
}
