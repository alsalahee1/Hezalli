"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { payUser } from "@/lib/actions/wallet-p2p";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletPinField } from "@/components/wallet/wallet-pin-field";

export function PayUserForm({
  recipientId,
  recipientName,
  balance,
  hasPin,
}: {
  recipientId: string;
  recipientName: string;
  balance: number;
  hasPin: boolean;
}) {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await payUser({
        recipientId,
        amountUsd: Number(amount),
        note: note || undefined,
        pin,
      });
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        setTimeout(() => router.push("/account/wallet"), 1200);
      }
    });

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="font-medium">
          {t("paySuccess", { name: recipientName })}
        </p>
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
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("sendNote")}
      />
      <WalletPinField hasPin={hasPin} value={pin} onChange={setPin} />
      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}
      <Button
        className="w-full"
        disabled={pending || !amount || !hasPin || pin.length < 4}
        onClick={submit}
      >
        {pending ? t("submitting") : t("payNow", { name: recipientName })}
      </Button>
    </div>
  );
}
