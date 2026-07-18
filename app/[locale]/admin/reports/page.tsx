import { Download } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { reportSummary } from "@/lib/admin-metrics";

export const dynamic = "force-dynamic";

function monthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const t = await getTranslations("AdminReports");
  const format = await getFormatter();
  const locale = await getLocale();
  const sp = await searchParams;

  const fromStr = sp.from || monthStart();
  const toStr = sp.to || new Date().toISOString().slice(0, 10);
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T23:59:59");

  const s = await reportSummary(from, to);
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const rows: { label: string; value: string }[] = [
    { label: t("sales"), value: money(s.sales) },
    { label: t("orders"), value: String(s.ordersCount) },
    { label: t("commission"), value: money(s.commission) },
    { label: t("discounts"), value: money(s.discountTotal) },
    { label: t("refunds"), value: `${money(s.refunds)} (${s.refundsCount})` },
    { label: t("payouts"), value: `${money(s.payouts)} (${s.payoutsCount})` },
  ];

  void locale;
  const exportHref = `/api/admin/reports/export?from=${fromStr}&to=${toStr}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t("from")}
          <input
            type="date"
            name="from"
            defaultValue={fromStr}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t("to")}
          <input
            type="date"
            name="to"
            defaultValue={toStr}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium"
        >
          {t("apply")}
        </button>
        <a
          href={exportHref}
          className="hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-medium"
        >
          <Download className="size-4" /> {t("exportCsv")}
        </a>
      </form>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="bg-card rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">{r.label}</p>
            <p className="mt-1 text-xl font-semibold" dir="ltr">
              {r.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
