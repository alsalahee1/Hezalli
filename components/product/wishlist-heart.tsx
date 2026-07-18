"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";

import { toggleWishlist } from "@/lib/actions/wishlist";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Heart toggle used on product cards and the product page. Requires login —
// guests are sent to /login and returned afterwards.
export function WishlistHeart({
  productId,
  initialInWishlist = false,
  className,
  size = 18,
}: {
  productId: string;
  initialInWishlist?: boolean;
  className?: string;
  size?: number;
}) {
  const router = useRouter();
  const [inList, setInList] = useState(initialInWishlist);
  const [pending, start] = useTransition();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    start(async () => {
      const res = await toggleWishlist(productId);
      if (res.error === "unauthorized") {
        const back =
          typeof window !== "undefined" ? window.location.pathname : "/";
        router.push(`/login?callbackUrl=${encodeURIComponent(back)}`);
        return;
      }
      if (typeof res.inWishlist === "boolean") setInList(res.inWishlist);
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={inList}
      aria-label="Wishlist"
      className={cn(
        "flex items-center justify-center rounded-full bg-white/85 shadow-sm transition-colors hover:bg-white",
        className,
      )}
      style={{ width: size + 14, height: size + 14 }}
    >
      <Heart
        style={{ width: size, height: size }}
        className={cn(
          inList ? "fill-destructive text-destructive" : "text-foreground/70",
        )}
      />
    </button>
  );
}
