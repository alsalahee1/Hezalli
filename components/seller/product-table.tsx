"use client";

import { useRef, useState, useTransition } from "react";
import { Archive, Check, Copy, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  bulkSetStatus,
  duplicateProduct,
  quickUpdateVariant,
} from "@/lib/actions/inventory";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ProductRow = {
  id: string;
  title: string;
  coverUrl: string | null;
  status: "DRAFT" | "ACTIVE" | "HIDDEN" | "REMOVED";
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  variantCount: number;
  singleVariantId: string | null;
  lowStockThreshold: number;
  salesCount: number;
};

function StockBadges({
  stock,
  threshold,
}: {
  stock: number;
  threshold: number;
}) {
  const t = useTranslations("SellerProducts");
  if (stock === 0)
    return (
      <span className="bg-destructive/10 text-destructive ms-2 rounded px-1.5 py-0.5 text-xs font-medium">
        {t("outOfStock")}
      </span>
    );
  if (threshold > 0 && stock <= threshold)
    return (
      <span className="ms-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600">
        {t("lowStock")}
      </span>
    );
  return null;
}

function QuickCells({ row }: { row: ProductRow }) {
  const router = useRouter();
  const [price, setPrice] = useState(String(row.minPrice));
  const [stock, setStock] = useState(String(row.totalStock));
  const [saving, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);

  const save = () => {
    if (!dirty.current || !row.singleVariantId) return;
    dirty.current = false;
    start(async () => {
      const res = await quickUpdateVariant({
        variantId: row.singleVariantId!,
        price: Number(price),
        stock: Number(stock),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        router.refresh();
      }
    });
  };

  return (
    <>
      <td className="px-3 py-2">
        <Input
          type="number"
          min={0}
          step="0.01"
          dir="ltr"
          className="w-24"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            dirty.current = true;
          }}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center">
          <Input
            type="number"
            min={0}
            dir="ltr"
            className="w-20"
            value={stock}
            onChange={(e) => {
              setStock(e.target.value);
              dirty.current = true;
            }}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <StockBadges
            stock={Number(stock)}
            threshold={row.lowStockThreshold}
          />
          {saving ? (
            <Loader2 className="text-muted-foreground ms-1 size-3.5 animate-spin" />
          ) : saved ? (
            <Check className="ms-1 size-3.5 text-emerald-600" />
          ) : null}
        </div>
      </td>
    </>
  );
}

export function ProductTable({ rows }: { rows: ProductRow[] }) {
  const t = useTranslations("SellerProducts");
  const format = useFormatter();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const statusBadge: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    ACTIVE: "bg-emerald-500/15 text-emerald-600",
    HIDDEN: "bg-amber-500/15 text-amber-600",
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = (status: "ACTIVE" | "HIDDEN" | "REMOVED") => {
    const ids = [...selected];
    if (status === "REMOVED" && !window.confirm(t("confirmArchive"))) return;
    start(async () => {
      await bulkSetStatus(ids, status);
      setSelected(new Set());
      router.refresh();
    });
  };

  const runDuplicate = (id: string) =>
    start(async () => {
      await duplicateProduct(id);
      router.refresh();
    });

  const runArchive = (id: string) => {
    if (!window.confirm(t("confirmArchive"))) return;
    start(async () => {
      await bulkSetStatus([id], "REMOVED");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <span className="font-medium">
            {t("selectedCount", { count: selected.size })}
          </span>
          <div className="ms-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => runBulk("ACTIVE")}
            >
              {t("bulkPublish")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => runBulk("HIDDEN")}
            >
              {t("bulkUnpublish")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() => runBulk("REMOVED")}
            >
              {t("bulkArchive")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={t("selectAll")}
                  className="size-4"
                />
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("product")}
              </th>
              <th className="px-3 py-2 text-start font-medium">{t("price")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("stock")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("sold")}</th>
              <th className="px-3 py-2 text-start font-medium">
                {t("statusCol")}
              </th>
              <th className="px-3 py-2 text-end font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t align-middle">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    aria-label={t("selectRow")}
                    className="size-4"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted size-10 shrink-0 overflow-hidden rounded">
                      {row.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.coverUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : null}
                    </div>
                    <span className="font-medium">{row.title}</span>
                  </div>
                </td>

                {row.singleVariantId ? (
                  <QuickCells row={row} />
                ) : (
                  <>
                    <td className="px-3 py-2 whitespace-nowrap" dir="ltr">
                      {money(row.minPrice)}
                      {row.maxPrice !== row.minPrice
                        ? ` – ${money(row.maxPrice)}`
                        : ""}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          row.totalStock === 0 && "text-destructive",
                        )}
                      >
                        {row.totalStock}
                      </span>
                      <StockBadges
                        stock={row.totalStock}
                        threshold={row.lowStockThreshold}
                      />
                      <span className="text-muted-foreground ms-2 text-xs">
                        {t("variantsN", { count: row.variantCount })}
                      </span>
                    </td>
                  </>
                )}

                <td className="px-3 py-2">{row.salesCount}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      statusBadge[row.status] ?? "bg-muted",
                    )}
                  >
                    {t(`status_${row.status}`)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/seller/products/${row.id}/edit`}>
                        {t("edit")}
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={t("duplicate")}
                      aria-label={t("duplicate")}
                      disabled={pending}
                      onClick={() => runDuplicate(row.id)}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      title={t("archive")}
                      aria-label={t("archive")}
                      disabled={pending}
                      onClick={() => runArchive(row.id)}
                    >
                      <Archive className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
