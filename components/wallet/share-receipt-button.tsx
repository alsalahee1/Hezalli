"use client";

import { useState, useTransition } from "react";
import { Check, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { createReceiptShareLink } from "@/lib/actions/wallet-receipt";
import { Button } from "@/components/ui/button";

// "Share receipt" — mints (once) the public receipt token for this transaction,
// then opens the native share sheet, falling back to copying the link.
export function ShareReceiptButton({ entryId }: { entryId: string }) {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const share = () =>
    start(async () => {
      setErr(null);
      const res = await createReceiptShareLink(entryId);
      if (res.error || !res.token) {
        setErr(res.error ?? "notFound");
        return;
      }
      const url = `${window.location.origin}/${locale}/receipt/${res.token}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: t("receiptTitle"), url });
          return;
        }
      } catch {
        // User dismissed the share sheet — fall through to copy.
      }
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setErr("notFound");
      }
    });

  return (
    <div className="space-y-1">
      <Button className="w-full" onClick={share} disabled={pending}>
        {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
        {copied ? t("copied") : t("shareReceipt")}
      </Button>
      {err ? (
        <p className="text-destructive text-center text-xs">
          {t(`err_${err}`)}
        </p>
      ) : null}
    </div>
  );
}
