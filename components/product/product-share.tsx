"use client";

import { useState, useTransition } from "react";
import { Heart, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { toggleWishlist } from "@/lib/actions/wishlist";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ProductShare({
  productId,
  initialInWishlist = false,
}: {
  productId: string;
  initialInWishlist?: boolean;
}) {
  const t = useTranslations("Product");
  const router = useRouter();
  const [inList, setInList] = useState(initialInWishlist);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const flash = (msg: string) => {
    setNote(msg);
    window.setTimeout(() => setNote(null), 2000);
  };

  const toggle = () =>
    start(async () => {
      const res = await toggleWishlist(productId);
      if (res.error === "unauthorized") {
        router.push(
          `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`,
        );
        return;
      }
      if (typeof res.inWishlist === "boolean") setInList(res.inWishlist);
    });

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
      /* dismissed */
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={toggle}
      >
        <Heart
          className={cn(
            "size-4",
            inList ? "fill-destructive text-destructive" : "",
          )}
        />
        {inList ? t("inWishlist") : t("wishlist")}
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
