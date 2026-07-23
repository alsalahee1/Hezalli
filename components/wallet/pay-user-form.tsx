"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { payUser } from "@/lib/actions/wallet-p2p";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import {
  useDisplayCurrency,
  useMoney,
} from "@/components/currency/currency-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletAuthField } from "@/components/wallet/wallet-auth-field";
import { ShareReceiptButton } from "@/components/wallet/share-receipt-button";
import type { WalletAuth } from "@/lib/wallet-step-auth";

export function PayUserForm({
  recipientId,
  recipientName,
  balance,
  hasPin,
  hasPasskey,
}: {
  recipientId: string;
  recipientName: string;
  balance: number;
  hasPin: boolean;
  hasPasskey: boolean;
}) {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const router = useRouter();
  const fmt = useMoney();
  const display = useDisplayCurrency();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [entryId, setEntryId] = useState<string | null>(null);

  const run = (auth: WalletAuth) =>
    start(async () => {
      setErr(null);
      const res = await payUser({
        recipientId,
        amountUsd: Number(amount),
        note: note || undefined,
        ...auth,
      });
      if (res.error) setErr(res.error);
      else {
        // Stay on the success screen so the sender can share the receipt;
        // they return to the wallet with the button below.
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
            {t("paySuccess", { name: recipientName })}
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
      />
      {display.code !== "USD" && Number(amount) > 0 ? (
        <p className="text-muted-foreground text-xs" dir="ltr">
          ≈ {fmt(Number(amount))}
        </p>
      ) : null}
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("sendNote")}
      />
      <WalletAuthField
        hasPin={hasPin}
        hasPasskey={hasPasskey}
        disabled={!amount}
        pending={pending}
        error={err}
        submitLabel={t("payNow", { name: recipientName })}
        onAuthorize={run}
        fullWidth
      />
    </div>
  );
}
