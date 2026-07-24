"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { remitCodToHezalliWallet } from "@/lib/actions/cod-wallet-remit";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { WalletAuthField } from "@/components/wallet/wallet-auth-field";
import type { WalletAuth } from "@/lib/wallet-step-auth";

/**
 * Driver ledger card: settle collected COD cash straight into the Hezalli
 * wallet from the driver's own HezalliPay balance. The most they can move now is
 * min(cash to remit, spendable wallet balance); authorization reuses the shared
 * wallet PIN/passkey control.
 */
export function RemitToWalletForm({
  cash,
  balance,
  hasPin,
  hasPasskey,
}: {
  cash: number; // COD cash still owed to Hezalli
  balance: number; // spendable HezalliPay balance (available − pledged)
  hasPin: boolean;
  hasPasskey: boolean;
}) {
  const t = useTranslations("Driver");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const max = Math.max(0, Math.min(cash, balance));
  const [amount, setAmount] = useState(max > 0 ? max.toFixed(2) : "");

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= max + 0.005;

  const run = (auth: WalletAuth) =>
    start(async () => {
      setErr(null);
      setOk(false);
      const res = await remitCodToHezalliWallet({ amountUsd: value, ...auth });
      if (res.error) setErr(res.error);
      else {
        setOk(true);
        setAmount("");
        router.refresh();
      }
    });

  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="text-sm font-semibold">{t("walletRemitTitle")}</h2>
      <p className="text-muted-foreground text-xs">{t("walletRemitHint")}</p>
      <p className="text-muted-foreground text-xs">
        {t("walletRemitMax", {
          cash: formatUsd(cash, locale),
          balance: formatUsd(balance, locale),
        })}
      </p>

      {max <= 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400">
          {t("walletRemitNoBalance")}
        </p>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-xs font-medium">
              {t("walletRemitAmount")}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max={max}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              dir="ltr"
              className="sm:w-48"
            />
          </label>
          <WalletAuthField
            hasPin={hasPin}
            hasPasskey={hasPasskey}
            disabled={!valid}
            pending={pending}
            error={err}
            submitLabel={t("walletRemitSubmit")}
            onAuthorize={run}
          />
        </>
      )}

      {ok && !err ? (
        <p className="text-xs text-emerald-600">{t("walletRemitDone")}</p>
      ) : null}
    </section>
  );
}
