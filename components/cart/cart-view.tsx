"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Store as StoreIcon, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useMoney } from "@/components/currency/currency-provider";

import { useCart, type CartNotice } from "./cart-provider";

export function CartView() {
  const t = useTranslations("Cart");
  const fmt = useMoney();
  const {
    lines,
    saved,
    ready,
    setQty,
    remove,
    saveForLater,
    moveToCart,
    refresh,
  } = useCart();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<CartNotice[]>([]);
  const [initialised, setInitialised] = useState(false);

  // Revalidate price/stock once the cart is loaded, then default-select every
  // in-stock line.
  useEffect(() => {
    if (!ready || initialised) return;
    setInitialised(true);
    refresh().then((n) => setNotices(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, initialised]);

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const l of lines) {
        if (l.stock > 0 && (prev.has(l.variantId) || !initialised))
          next.add(l.variantId);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { storeName: string; storeSlug: string; lines: typeof lines }
    >();
    for (const l of lines) {
      const g = map.get(l.storeId) ?? {
        storeName: l.storeName,
        storeSlug: l.storeSlug,
        lines: [],
      };
      g.lines.push(l);
      map.set(l.storeId, g);
    }
    return [...map.entries()].map(([storeId, g]) => ({ storeId, ...g }));
  }, [lines]);

  const selectableIds = lines
    .filter((l) => l.stock > 0)
    .map((l) => l.variantId);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggle = (variantId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });

  const selectedLines = lines.filter(
    (l) => selected.has(l.variantId) && l.stock > 0,
  );
  const total = selectedLines.reduce((s, l) => s + l.price * l.quantity, 0);
  const selectedCount = selectedLines.reduce((s, l) => s + l.quantity, 0);

  if (ready && lines.length === 0 && saved.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <StoreIcon className="text-muted-foreground size-10" />
        <div>
          <p className="text-lg font-medium">{t("empty")}</p>
          <p className="text-muted-foreground text-sm">{t("emptyHint")}</p>
        </div>
        <Button asChild>
          <Link href="/search">{t("browse")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {notices.length > 0 ? (
          <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
            {notices.map((n) => (
              <p key={n.variantId}>
                {n.kind === "removed"
                  ? t("noticeRemoved", { title: n.title })
                  : n.kind === "stock"
                    ? t("noticeStock", { title: n.title })
                    : t("noticePrice", { title: n.title })}
              </p>
            ))}
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={allSelected}
            onChange={(e) =>
              setSelected(e.target.checked ? new Set(selectableIds) : new Set())
            }
          />
          {t("selectAll")}
        </label>

        {groups.map((g) => (
          <div key={g.storeId} className="rounded-lg border">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <StoreIcon className="text-muted-foreground size-4" />
              <Link
                href={`/store/${g.storeSlug}`}
                className="text-sm font-medium hover:underline"
              >
                {g.storeName}
              </Link>
            </div>
            <ul className="divide-y">
              {g.lines.map((l) => {
                const oos = l.stock <= 0;
                return (
                  <li key={l.variantId} className="flex gap-1 p-4">
                    <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        className="size-4"
                        disabled={oos}
                        checked={selected.has(l.variantId)}
                        onChange={() => toggle(l.variantId)}
                      />
                    </label>
                    <Link
                      href={`/product/${l.productSlug}`}
                      className="bg-muted size-20 shrink-0 overflow-hidden rounded"
                    >
                      {l.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={l.image}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : null}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/product/${l.productSlug}`}
                        className="line-clamp-2 text-sm font-medium hover:underline"
                      >
                        {l.title}
                      </Link>
                      {l.variantName && l.variantName !== "Default" ? (
                        <p className="text-muted-foreground text-xs">
                          {l.variantName}
                        </p>
                      ) : null}
                      <p className="mt-1 font-semibold" dir="ltr">
                        {fmt(l.price)}
                      </p>
                      {oos ? (
                        <p className="text-destructive text-xs font-medium">
                          {t("outOfStock")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end justify-between gap-2">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => saveForLater(l.variantId)}
                          className="text-muted-foreground hover:text-foreground flex min-h-9 items-center px-2 text-xs hover:underline"
                        >
                          {t("saveForLater")}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(l.variantId)}
                          className="text-muted-foreground hover:text-destructive flex size-9 items-center justify-center"
                          aria-label={t("remove")}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="flex items-center rounded-md border">
                        <button
                          type="button"
                          className="hover:bg-muted flex size-10 items-center justify-center disabled:opacity-40"
                          disabled={oos || l.quantity <= 1}
                          onClick={() => setQty(l.variantId, l.quantity - 1)}
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-9 text-center text-sm tabular-nums">
                          {l.quantity}
                        </span>
                        <button
                          type="button"
                          className="hover:bg-muted flex size-10 items-center justify-center disabled:opacity-40"
                          disabled={oos || l.quantity >= l.stock}
                          onClick={() => setQty(l.variantId, l.quantity + 1)}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {saved.length > 0 ? (
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2.5 text-sm font-medium">
              {t("savedTitle", { count: saved.length })}
            </div>
            <ul className="divide-y">
              {saved.map((l) => (
                <li key={l.variantId} className="flex items-center gap-3 p-4">
                  <Link
                    href={`/product/${l.productSlug}`}
                    className="bg-muted size-16 shrink-0 overflow-hidden rounded"
                  >
                    {l.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.image}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/product/${l.productSlug}`}
                      className="line-clamp-1 text-sm font-medium hover:underline"
                    >
                      {l.title}
                    </Link>
                    <p className="font-semibold" dir="ltr">
                      {fmt(l.price)}
                    </p>
                    {l.stock <= 0 ? (
                      <p className="text-destructive text-xs">
                        {t("outOfStock")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => remove(l.variantId)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t("remove")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={l.stock <= 0}
                      onClick={() => moveToCart(l.variantId)}
                    >
                      {t("moveToCart")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Summary */}
      <aside className="h-fit rounded-lg border p-4 md:sticky md:top-24">
        <h2 className="mb-3 font-semibold">{t("summary")}</h2>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t("selectedItems", { count: selectedCount })}
          </span>
          <span dir="ltr">{fmt(total)}</span>
        </div>
        <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
          <span>{t("total")}</span>
          <span dir="ltr">{fmt(total)}</span>
        </div>
        <Button
          className="mt-4 w-full"
          disabled={selectedLines.length === 0}
          asChild={selectedLines.length > 0}
        >
          {selectedLines.length > 0 ? (
            <Link
              href={`/checkout?items=${selectedLines
                .map((l) => l.variantId)
                .join(",")}`}
            >
              {t("checkout")}
            </Link>
          ) : (
            <span>{t("checkout")}</span>
          )}
        </Button>
        <p className="text-muted-foreground mt-2 text-center text-xs">
          {t("checkoutNote")}
        </p>
      </aside>
    </div>
  );
}
