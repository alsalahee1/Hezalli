"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { moderateProduct } from "@/lib/actions/moderation";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AdminProductRow = {
  id: string;
  title: string;
  storeName: string;
  storeSlug: string;
  categoryLabel: string;
  coverUrl: string | null;
  price: number;
  status: "DRAFT" | "ACTIVE" | "HIDDEN" | "REMOVED";
  moderationReason: string | null;
};

const statusBadge: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-emerald-500/15 text-emerald-600",
  HIDDEN: "bg-amber-500/15 text-amber-600",
  REMOVED: "bg-destructive/10 text-destructive",
};

function ModerationCell({ row }: { row: AdminProductRow }) {
  const t = useTranslations("AdminProducts");
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = (action: "hide" | "remove" | "restore") =>
    start(async () => {
      setErr(null);
      const res = await moderateProduct({ productId: row.id, action, reason });
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  if (row.status === "ACTIVE") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            className="h-8 w-36 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run("hide")}
          >
            {t("hide")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() => run("remove")}
          >
            {t("remove")}
          </Button>
        </div>
        {err ? <p className="text-destructive text-xs">{t(err)}</p> : null}
      </div>
    );
  }

  if (
    row.moderationReason &&
    (row.status === "HIDDEN" || row.status === "REMOVED")
  ) {
    return (
      <div className="flex flex-col items-end gap-1">
        <p className="text-muted-foreground max-w-48 text-end text-xs">
          {t("moderatedReason", { reason: row.moderationReason })}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run("restore")}
        >
          {t("restore")}
        </Button>
      </div>
    );
  }

  return <span className="text-muted-foreground text-xs">—</span>;
}

function StatusBadge({ status }: { status: AdminProductRow["status"] }) {
  const t = useTranslations("AdminProducts");
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        statusBadge[status] ?? "bg-muted",
      )}
    >
      {t(`status_${status}`)}
    </span>
  );
}

function ProductCover({ row }: { row: AdminProductRow }) {
  return (
    <div className="bg-muted size-12 shrink-0 overflow-hidden rounded">
      {row.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.coverUrl} alt="" className="size-full object-cover" />
      ) : null}
    </div>
  );
}

function SellerLink({ row }: { row: AdminProductRow }) {
  return (
    <Link
      href={`/store/${row.storeSlug}`}
      className="text-primary inline-flex items-center gap-1 hover:underline"
    >
      {row.storeName}
      <ExternalLink className="size-3" />
    </Link>
  );
}

/** Stacked card list — the native-app-style layout used on small screens. */
function AdminProductsCards({ rows }: { rows: AdminProductRow[] }) {
  const t = useTranslations("AdminProducts");
  const format = useFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  return (
    <ul className="space-y-3 md:hidden">
      {rows.map((row) => (
        <li key={row.id} className="rounded-lg border p-3">
          <div className="flex items-start gap-3">
            <ProductCover row={row} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium break-words">{row.title}</span>
                <StatusBadge status={row.status} />
              </div>
              <div className="text-muted-foreground mt-1 text-xs">
                <SellerLink row={row} />
              </div>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">{t("category")}</dt>
              <dd>{row.categoryLabel}</dd>
            </div>
            <div className="text-end">
              <dt className="text-muted-foreground text-xs">{t("price")}</dt>
              <dd dir="ltr" className="inline-block">
                {money(row.price)}
              </dd>
            </div>
          </dl>

          <div className="mt-3 border-t pt-3">
            <ModerationCell row={row} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AdminProductsTable({ rows }: { rows: AdminProductRow[] }) {
  const t = useTranslations("AdminProducts");
  const format = useFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  return (
    <>
      <AdminProductsCards rows={rows} />
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-3 py-2 text-start font-medium">
                {t("product")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("seller")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("category")}
              </th>
              <th className="px-3 py-2 text-start font-medium">{t("price")}</th>
              <th className="px-3 py-2 text-start font-medium">
                {t("statusCol")}
              </th>
              <th className="px-3 py-2 text-end font-medium">
                {t("moderation")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <ProductCover row={row} />
                    <span className="font-medium">{row.title}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <SellerLink row={row} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {row.categoryLabel}
                </td>
                <td className="px-3 py-2 whitespace-nowrap" dir="ltr">
                  {money(row.price)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2">
                  <ModerationCell row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
