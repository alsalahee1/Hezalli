"use client";

import { useEffect, useRef, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useMoney } from "@/components/currency/currency-provider";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useMountTransition } from "@/components/ui/use-mount-transition";

import { useCart } from "./cart-provider";

export function CartButton() {
  const t = useTranslations("Cart");
  const fmt = useMoney();
  const { lines, count } = useCart();
  const [open, setOpen] = useState(false);
  const { mounted, shown } = useMountTransition(open, 200);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("cart")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="relative">
          <ShoppingCart className="size-5" />
          {count > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -end-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </span>
      </Button>

      {mounted ? (
        <div
          className={cn(
            "bg-popover fixed inset-x-2 top-16 z-50 origin-top rounded-md border shadow-lg transition duration-200 ease-out will-change-transform motion-reduce:transition-none sm:absolute sm:inset-x-auto sm:end-0 sm:top-auto sm:mt-2 sm:w-80",
            shown
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-1 scale-95 opacity-0",
          )}
        >
          {lines.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              {t("empty")}
            </p>
          ) : (
            <>
              <div className="max-h-80 overflow-auto p-2">
                {lines.slice(0, 6).map((l) => (
                  <Link
                    key={l.variantId}
                    href={`/product/${l.productSlug}`}
                    onClick={() => setOpen(false)}
                    className="hover:bg-muted flex items-center gap-2 rounded p-2"
                  >
                    <span className="bg-muted size-12 shrink-0 overflow-hidden rounded">
                      {l.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={l.image}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium">
                        {l.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {l.quantity} × {fmt(l.price)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              <div className="border-t p-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("subtotal")}</span>
                  <span className="font-semibold" dir="ltr">
                    {fmt(subtotal)}
                  </span>
                </div>
                <Button
                  asChild
                  className="w-full"
                  onClick={() => setOpen(false)}
                >
                  <Link href="/cart">{t("viewCart")}</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
