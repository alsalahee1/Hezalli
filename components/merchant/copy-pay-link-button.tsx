"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

// Share (or copy) an absolute merchant pay link — the customer opens it to pay.
// Native share sheet when available, clipboard fallback otherwise.
export function CopyPayLinkButton({ url }: { url: string }) {
  const t = useTranslations("Merchant");
  const [copied, setCopied] = useState(false);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: t("appName"), url });
        return;
      }
    } catch {
      // Dismissed — fall through to copy.
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access — nothing more we can do silently.
    }
  };

  return (
    <Button variant="outline" className="w-full" onClick={share}>
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? t("linkCopied") : t("shareLink")}
    </Button>
  );
}
