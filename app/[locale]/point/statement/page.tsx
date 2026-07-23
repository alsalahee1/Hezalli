import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { canViewMoney } from "@/lib/point-access";
import { monthRange, pointStatement } from "@/lib/point-statement";
import { cn } from "@/lib/utils";
import { Link, redirect } from "@/i18n/navigation";

// The hub's monthly statement (docs §28): opening → entries → closing for
// both the earnings side and the COD cash side, plus a CSV export.
export default async function PointStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  // Money view: hidden from cashiers/organizers (docs §42d).
  if (!canViewMoney(gate.access)) {
    redirect({ href: "/point", locale: await getLocale() });
  }
  const { month } = await searchParams;
  const t = await getTranslations("Point");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const { from, to, key } = monthRange(month);
  const stmt = await pointStatement(gate.pointId, from, to);

  const shift = (delta: number) => {
    const d = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + delta, 1),
    );
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const monthLabel = format.dateTime(from, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const sides = [
    { key: "earnings", data: stmt.earnings },
    { key: "cash", data: stmt.cash },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("stmtTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("stmtSubtitle")}</p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between rounded-xl border p-2">
        <Link
          href={`/point/statement?month=${shift(-1)}`}
          className="hover:bg-muted rounded-md p-2"
          aria-label={t("stmtPrev")}
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Link>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <Link
          href={`/point/statement?month=${shift(1)}`}
          className="hover:bg-muted rounded-md p-2"
          aria-label={t("stmtNext")}
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Link>
      </div>

      {sides.map((s) => (
        <div key={s.key} className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-semibold">{t(`stmt_${s.key}`)}</p>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">
                {t("stmtOpening")}
              </dt>
              <dd className="font-medium" dir="ltr">
                {money(s.data.opening)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t("stmtChange")}
              </dt>
              <dd
                className={cn(
                  "font-medium",
                  s.data.delta > 0 && "text-emerald-600",
                  s.data.delta < 0 && "text-destructive",
                )}
                dir="ltr"
              >
                {money(s.data.delta)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t("stmtClosing")}
              </dt>
              <dd className="font-semibold" dir="ltr">
                {money(s.data.closing)}
              </dd>
            </div>
          </dl>
          <ul className="text-muted-foreground space-y-0.5 text-xs">
            {Object.entries(s.data.byType)
              .filter(([, v]) => v !== 0)
              .map(([type, v]) => (
                <li key={type} className="flex justify-between">
                  <span>{t(`ledger_${type}`)}</span>
                  <span dir="ltr">{money(v)}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}

      <a
        href={`/api/point/statement?month=${key}`}
        className="text-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        download
      >
        <Download className="size-4" /> {t("stmtCsv")}
      </a>

      {stmt.entries.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          {t("noEntries")}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {stmt.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t(`ledger_${e.type}`)}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {format.dateTime(e.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {e.note ? ` — ${e.note}` : null}
                </p>
              </div>
              <span
                className={
                  e.amountUsd >= 0
                    ? "font-semibold text-emerald-600"
                    : "text-destructive font-semibold"
                }
                dir="ltr"
              >
                {money(e.amountUsd)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
