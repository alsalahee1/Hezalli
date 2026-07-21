import { getFormatter, getTranslations } from "next-intl/server";
import { FileText, Wallet } from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { courierCashSummary } from "@/lib/courier-ledger";
import { transferCourierEarningsToWallet } from "@/lib/actions/earnings-wallet";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { MoveEarningsToWallet } from "@/components/wallet/move-earnings-to-wallet";

// The driver's cash & earnings ledger (docs §30): the same headline figures
// as the driver home, plus the entries behind them.
export default async function DriverLedgerPage() {
  const courierId = await requireCourierId();
  if (!courierId) return null;
  const t = await getTranslations("Driver");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [cash, entries] = await Promise.all([
    courierCashSummary(courierId),
    prisma.courierLedgerEntry.findMany({
      where: { courierId },
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
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t("ledgerTitle")}</h1>
          <p className="text-muted-foreground text-sm">{t("ledgerSubtitle")}</p>
        </div>
        <Link
          href="/driver/statement"
          className="text-primary inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline"
        >
          <FileText className="size-4" /> {t("stmtLink")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
            <Wallet className="size-3.5" /> {t("cashToRemit")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(cash.cashOnHand)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-500">
            {t("earnings")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(cash.earnings)}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("totalCollected")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(cash.totalCollected)}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("totalRemitted")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(cash.totalRemitted)}
          </p>
        </div>
      </div>

      {/* Sweep the earnings Hezalli owes into the HezalliPay wallet. */}
      <MoveEarningsToWallet
        action={transferCourierEarningsToWallet}
        namespace="Driver"
        disabled={cash.earnings <= 0}
      />

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
