import { getFormatter, getTranslations } from "next-intl/server";
import { FileText, ShieldAlert, Wallet } from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { courierCodStatus } from "@/lib/cod-guard";
import { courierCashSummary } from "@/lib/courier-ledger";
import { transferCourierEarningsToWallet } from "@/lib/actions/earnings-wallet";
import { prisma } from "@/lib/prisma";
import { getWalletId } from "@/lib/wallet";
import { walletHasPin } from "@/lib/wallet-pin";
import { Link } from "@/i18n/navigation";
import { WalletHoldForm } from "@/components/driver/wallet-hold-form";
import { RemitToWalletForm } from "@/components/driver/remit-to-wallet-form";
import { RemitClaimForm } from "@/components/ops/remit-claim-form";
import { MoveEarningsToWallet } from "@/components/wallet/move-earnings-to-wallet";
import { WalletSecurityDialog } from "@/components/wallet/wallet-security-dialog";

// The driver's cash & earnings ledger (docs §30): the same headline figures
// as the driver home, plus the entries behind them.
export default async function DriverLedgerPage() {
  const courierId = await requireCourierId();
  if (!courierId) return null;
  const t = await getTranslations("Driver");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const walletId = await getWalletId(courierId);
  const [cash, cod, wallet, pendingClaim, entries, hasPin, passkeys] =
    await Promise.all([
      courierCashSummary(courierId),
      courierCodStatus(courierId),
      prisma.wallet.findUniqueOrThrow({
        where: { id: walletId },
        select: { availableUsd: true, codHoldUsd: true },
      }),
      prisma.remitClaim.findFirst({
        where: { courierId, status: "PENDING" },
        select: { amountUsd: true, method: true, reference: true },
      }),
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
      walletHasPin(courierId),
      prisma.walletCredential.count({ where: { userId: courierId } }),
    ]);

  // Spendable HezalliPay balance = available minus any COD collateral pledge,
  // which isn't spendable. This funds an in-app remittance to the Hezalli wallet.
  const spendable = Math.max(
    0,
    Number(wallet.availableUsd) - Number(wallet.codHoldUsd),
  );

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

      {/* Without a wallet PIN or passkey the driver can't authorize ANY outflow
          here (remit, move earnings, withdraw), so surface the one-time setup up
          front — the individual forms also link out, but this makes it findable
          before the driver hits a wall inside a form. */}
      {!hasPin && passkeys === 0 ? (
        <WalletSecurityDialog
          hasPin={hasPin}
          hasPasskey={passkeys > 0}
          className="flex w-full items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-start transition-colors hover:border-amber-500/70"
        >
          <span className="rounded-full bg-amber-500/15 p-2 text-amber-600 dark:text-amber-500">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {t("pinSetupTitle")}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t("pinSetupHint")}
            </p>
          </div>
          <span className="text-primary shrink-0 text-sm font-medium">
            {t("pinSetupCta")}
          </span>
        </WalletSecurityDialog>
      ) : null}

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

      {/* Instant in-app remittance: settle held COD cash straight into the
          Hezalli wallet from the driver's HezalliPay balance. No staff step —
          the money moves inside HezalliPay. */}
      {cash.cashOnHand > 0 ? (
        <RemitToWalletForm
          cash={cash.cashOnHand}
          balance={spendable}
          hasPin={hasPin}
          hasPasskey={passkeys > 0}
        />
      ) : null}

      {/* Digital remittance (docs §38): transfer the cash over a rail and
          file the reference — staff confirm and the ledger settles. */}
      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">{t("remitTitle")}</h2>
        {pendingClaim ? (
          <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-500">
            {t("remitPending", {
              amount: money(Number(pendingClaim.amountUsd)),
              method: t(`remitMethod_${pendingClaim.method}`),
              reference: pendingClaim.reference,
            })}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">{t("remitHint")}</p>
            <RemitClaimForm
              who="courier"
              namespace="Driver"
              max={cash.cashOnHand}
            />
          </>
        )}
      </section>

      {/* COD collateral pledge (docs §36): lock wallet balance → higher limit. */}
      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">{t("holdTitle")}</h2>
        <p className="text-muted-foreground text-xs">
          {t("holdHint", {
            balance: money(Number(wallet.availableUsd)),
            hold: money(Number(wallet.codHoldUsd)),
            limit: money(cod.cashLimit),
          })}
        </p>
        <WalletHoldForm current={Number(wallet.codHoldUsd)} />
      </section>

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
