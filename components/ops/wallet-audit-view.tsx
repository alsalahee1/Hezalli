import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { findDriftedWallets, getWalletLiability } from "@/lib/wallet-reconcile";
import { ReconcileButton } from "@/components/admin/reconcile-button";

export const dynamic = "force-dynamic";

export async function WalletAuditView() {
  const t = await getTranslations("AdminWalletAudit");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [summary, drifted] = await Promise.all([
    getWalletLiability(),
    findDriftedWallets(),
  ]);
  const consistent = Math.abs(summary.drift) <= 0.005 && drifted.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      {/* Liability summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-xs">{t("totalLiability")}</p>
          <p className="text-xl font-semibold" dir="ltr">
            {money(summary.totalLiability)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-xs">{t("ledgerTotal")}</p>
          <p className="text-xl font-semibold" dir="ltr">
            {money(summary.ledgerTotal)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-xs">{t("walletCount")}</p>
          <p className="text-xl font-semibold" dir="ltr">
            {format.number(summary.walletCount)}
          </p>
        </div>
      </div>

      {/* Integrity banner */}
      {consistent ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>{t("consistent")}</span>
        </div>
      ) : (
        <div className="border-destructive/40 bg-destructive/5 text-destructive space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-5 shrink-0" />
            <span>{t("driftFound", { count: drifted.length })}</span>
          </div>
          <ul className="divide-y rounded-lg border">
            {drifted.map((d) => (
              <li
                key={d.userId}
                className="bg-background flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div className="text-foreground">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-muted-foreground text-xs" dir="ltr">
                    {t("stored")} {money(d.stored)} · {t("computed")}{" "}
                    {money(d.computed)} · Δ {money(d.diff)}
                  </p>
                </div>
                <ReconcileButton userId={d.userId} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
