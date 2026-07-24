"use client";

import { useState, useTransition } from "react";
import { ShoppingCart, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { toggleWishlist } from "@/lib/actions/wishlist";
import type { CartLine } from "@/lib/cart-types";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { Button } from "@/components/ui/button";

export type WishlistCardData = {
  productId: string;
  slug: string;
  title: string;
  image: string | null;
  priceLabel: string;
  compareAtLabel: string | null;
  inStock: boolean;
  addLine: CartLine | null;
};

export function WishlistGrid({ initial }: { initial: WishlistCardData[] }) {
  const t = useTranslations("Wishlist");
  const { addItem } = useCart();
  const [items, setItems] = useState(initial);
  const [, start] = useTransition();
  const [added, setAdded] = useState<string | null>(null);

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
    start(async () => {
      await toggleWishlist(productId);
    });
  };

  const add = async (item: WishlistCardData) => {
    if (!item.addLine) return;
    await addItem(item.addLine, 1);
    setAdded(item.productId);
    window.setTimeout(() => setAdded(null), 1500);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg font-medium">{t("empty")}</p>
        <Button asChild>
          <Link href="/search">{t("browse")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.productId}
          className="bg-card relative flex flex-col overflow-hidden rounded-lg border"
        >
          <button
            type="button"
            onClick={() => removeItem(item.productId)}
            aria-label={t("remove")}
            className="absolute end-1 top-1 z-10 flex size-9 items-center justify-center rounded-full bg-white/85 shadow-sm hover:bg-white"
          >
            <X className="size-4" />
          </button>
          <Link
            href={`/product/${item.slug}`}
            className="bg-muted aspect-square overflow-hidden"
          >
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.image}
                alt={item.title}
                className="size-full object-cover"
              />
            ) : null}
          </Link>
          <div className="flex flex-1 flex-col gap-1 p-3">
            <Link
              href={`/product/${item.slug}`}
              className="line-clamp-2 min-h-[2.5rem] text-sm font-medium hover:underline"
            >
              {item.title}
            </Link>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold" dir="ltr">
                {item.priceLabel}
              </span>
              {item.compareAtLabel ? (
                <span
                  className="text-muted-foreground text-xs line-through"
                  dir="ltr"
                >
                  {item.compareAtLabel}
                </span>
              ) : null}
            </div>
            <div className="mt-auto pt-2">
              {item.inStock ? (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => add(item)}
                  disabled={added === item.productId}
                >
                  <ShoppingCart className="size-4" />
                  {added === item.productId ? t("added") : t("addToCart")}
                </Button>
              ) : (
                <p className="text-destructive text-center text-xs font-medium">
                  {t("outOfStock")}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
