"use client";

import { useState } from "react";
import { Heart, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function ProductShare() {
  const t = useTranslations("Product");
  const [note, setNote] = useState<string | null>(null);
  const flash = (msg: string) => {
    setNote(msg);
    window.setTimeout(() => setNote(null), 2000);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      flash(t("linkCopied"));
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => flash(t("wishlistComingSoon"))}
      >
        <Heart className="size-4" />
        {t("wishlist")}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={share}>
        <Share2 className="size-4" />
        {t("share")}
      </Button>
      {note ? (
        <span className="text-muted-foreground text-xs">{note}</span>
      ) : null}
    </div>
  );
}
