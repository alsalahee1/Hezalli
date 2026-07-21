import { getFormatter, getTranslations } from "next-intl/server";
import { Wallet } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";
import { DriverCashInForm } from "@/components/point/driver-cash-in-form";

// The operator's earnings: handling fees accrued, payouts received, and the
// balance Hezalli still owes them. Read-only — payouts are recorded by admins.
export default async function PointLedgerPage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("Point");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [summary, entries, couriers] = await Promise.all([
    pointLedgerSummary(gate.pointId),
    prisma.deliveryPointLedgerEntry.findMany({
      where: { pointId: gate.pointId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        amountUsd: true,
        note: true,
        createdAt: true,
      },
    }),
    prisma.user.findMany({
      where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  const drivers = couriers.map((c) => ({
    id: c.id,
    name: c.name ?? c.email ?? c.id.slice(-6),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("ledgerTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("ledgerSubtitle")}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-500">
            <Wallet className="size-3.5" /> {t("balance")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(summary.balance)}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("totalFees")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(summary.totalFees)}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("totalPaidOut")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(summary.totalPaidOut)}
          </p>
        </div>
      </div>

      {/* Counter COD cash the point holds for Hezalli (pickup orders). */}
      {summary.cashOnHand > 0 || summary.totalCodCollected > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
              {t("cashToRemit")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(summary.cashOnHand)}
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-xs font-medium">
              {t("totalCodCollected")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(summary.totalCodCollected)}
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-xs font-medium">
              {t("totalCodRemitted")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(summary.totalCodRemitted)}
            </p>
          </div>
        </div>
      ) : null}

      {/* Record COD cash a courier hands in at the counter. */}
      <DriverCashInForm drivers={drivers} />

      {entries.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          {t("noEntries")}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t(`ledger_${e.type}`)}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {format.dateTime(e.createdAt, { dateStyle: "medium" })}
                  {e.note ? ` — ${e.note}` : null}
                </p>
              </div>
              <span
                className={
                  Number(e.amountUsd) >= 0
                    ? "font-semibold text-emerald-600"
                    : "text-destructive font-semibold"
                }
                dir="ltr"
              >
                {money(Number(e.amountUsd))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
