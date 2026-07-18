"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addFlashItem,
  createFlashSale,
  deleteFlashSale,
  removeFlashItem,
} from "@/lib/actions/flash";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ProductOption = {
  title: string;
  variants: { id: string; sku: string; price: number }[];
};
export type FlashSaleRow = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  items: {
    id: string;
    label: string;
    salePrice: number;
    origPrice: number;
    stockLimit: number | null;
    soldCount: number;
  }[];
};

export function FlashSaleManager({
  sales,
  products,
}: {
  sales: FlashSaleRow[];
  products: ProductOption[];
}) {
  const t = useTranslations("AdminFlash");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Create-sale form
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // Add-item form (per open sale)
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [variantId, setVariantId] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stockLimit, setStockLimit] = useState("");

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else {
        after?.();
        router.refresh();
      }
    });

  const variantOptions = products.flatMap((p) =>
    p.variants.map((v) => ({
      id: v.id,
      label: `${p.title} · ${v.sku} ($${v.price})`,
    })),
  );

  return (
    <div className="space-y-6">
      {/* Create sale */}
      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">{t("createTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder={t("nameEn")}
          />
          <Input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder={t("nameAr")}
            dir="rtl"
          />
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("starts")}
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              dir="ltr"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("ends")}
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              dir="ltr"
            />
          </label>
        </div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => createFlashSale({ nameEn, nameAr, startsAt, endsAt }),
              () => {
                setNameEn("");
                setNameAr("");
                setStartsAt("");
                setEndsAt("");
              },
            )
          }
        >
          <Plus className="size-4" /> {t("createSale")}
        </Button>
        {err ? (
          <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
        ) : null}
      </div>

      {/* Sales list */}
      {sales.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {sales.map((s) => (
            <li key={s.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-muted-foreground text-xs" dir="ltr">
                    {new Date(s.startsAt).toLocaleString()} →{" "}
                    {new Date(s.endsAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => run(() => deleteFlashSale(s.id))}
                >
                  <Trash2 className="size-4" /> {t("deleteSale")}
                </Button>
              </div>

              {s.items.length > 0 ? (
                <ul className="divide-y text-sm">
                  {s.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <span className="min-w-0">
                        <span className="line-clamp-1">{it.label}</span>
                        <span
                          className="text-muted-foreground text-xs"
                          dir="ltr"
                        >
                          ${it.salePrice} (was ${it.origPrice}) · {it.soldCount}
                          {it.stockLimit ? `/${it.stockLimit}` : ""} {t("sold")}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={pending}
                        onClick={() => run(() => removeFlashItem(it.id))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {addingTo === s.id ? (
                <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                  <label className="flex flex-col gap-1 text-xs font-medium">
                    {t("product")}
                    <select
                      value={variantId}
                      onChange={(e) => setVariantId(e.target.value)}
                      className="h-9 max-w-xs rounded-md border bg-transparent px-2 text-sm"
                    >
                      <option value="">—</option>
                      {variantOptions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium">
                    {t("salePrice")}
                    <Input
                      type="number"
                      min={0}
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                      className="h-9 w-28"
                      dir="ltr"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium">
                    {t("stockLimit")}
                    <Input
                      type="number"
                      min={0}
                      value={stockLimit}
                      onChange={(e) => setStockLimit(e.target.value)}
                      placeholder={t("unlimited")}
                      className="h-9 w-28"
                      dir="ltr"
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={pending || !variantId}
                    onClick={() =>
                      run(
                        () =>
                          addFlashItem({
                            flashSaleId: s.id,
                            variantId,
                            salePrice: Number(salePrice),
                            stockLimit:
                              stockLimit.trim() === ""
                                ? null
                                : Number(stockLimit),
                          }),
                        () => {
                          setVariantId("");
                          setSalePrice("");
                          setStockLimit("");
                          setAddingTo(null);
                        },
                      )
                    }
                  >
                    {t("addItem")}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddingTo(s.id)}
                >
                  <Plus className="size-4" /> {t("enrollProduct")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
