"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { payMerchant } from "@/lib/actions/merchant-pay";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import {
  useDisplayCurrency,
  useMoney,
} from "@/components/currency/currency-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WalletAuthField } from "@/components/wallet/wallet-auth-field";
import { ShareReceiptButton } from "@/components/wallet/share-receipt-button";
import type { WalletAuth } from "@/lib/wallet-step-auth";

// Pay a HezalliPay merchant from wallet balance. When the charge QR fixed the
// amount, the field is locked to it; the static store QR leaves it editable so
// the customer types what they owe. Mirrors PayUserForm.
export function PayMerchantForm({
  merchantId,
  merchantName,
  balance,
  fixedAmount,
  note: initialNote = "",
  hasPin,
  hasPasskey,
}: {
  merchantId: string;
  merchantName: string;
  balance: number;
  fixedAmount: number | null;
  note?: string;
  hasPin: boolean;
  hasPasskey: boolean;
}) {
  const t = useTranslations("Merchant");
  const locale = useLocale();
  const router = useRouter();
  const fmt = useMoney();
  const display = useDisplayCurrency();
  const [amount, setAmount] = useState(
    fixedAmount != null ? String(fixedAmount) : "",
  );
  const [note, setNote] = useState(initialNote);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [entryId, setEntryId] = useState<string | null>(null);

  const run = (auth: WalletAuth) =>
    start(async () => {
      setErr(null);
      const res = await payMerchant({
        merchantId,
        amountUsd: Number(amount),
        note: note || undefined,
        ...auth,
      });
      if (res.error) setErr(res.error);
      else {
        setEntryId(res.entryId ?? null);
        setDone(true);
      }
    });

  if (done) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
          <CheckCircle2 className="size-8 text-emerald-600" />
          <p className="font-medium">
            {t("paySuccess", { name: merchantName })}
          </p>
        </div>
        {entryId ? <ShareReceiptButton entryId={entryId} /> : null}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push("/account/wallet")}
        >
          {t("backToWallet")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        type="number"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={t("payAmount", { balance: formatUsd(balance, locale) })}
        dir="ltr"
        readOnly={fixedAmount != null}
        className={
          fixedAmount != null ? "text-center text-2xl font-bold" : undefined
        }
      />
      {display.code !== "USD" && Number(amount) > 0 ? (
        <p className="text-muted-foreground text-xs" dir="ltr">
          ≈ {fmt(Number(amount))}
        </p>
      ) : null}
      {/* Editable only when the customer sets the amount (static store QR). A
          charge QR fixes both amount and note. */}
      {fixedAmount == null ? (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("payNotePh")}
        />
      ) : note ? (
        <p className="text-muted-foreground text-center text-sm">{note}</p>
      ) : null}
      <WalletAuthField
        hasPin={hasPin}
        hasPasskey={hasPasskey}
        disabled={!amount || Number(amount) <= 0}
        pending={pending}
        error={err}
        submitLabel={t("payNow", { name: merchantName })}
        onAuthorize={run}
        fullWidth
      />
    </div>
  );
}
