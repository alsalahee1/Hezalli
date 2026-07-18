"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { sendWalletFunds } from "@/lib/actions/wallet-p2p";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WalletSendForm({ balance }: { balance: number }) {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await sendWalletFunds({
        recipient,
        amountUsd: Number(amount),
        note: note || undefined,
      });
      if (res.error) setErr(res.error);
      else {
        setOpen(false);
        setRecipient("");
        setAmount("");
        setNote("");
        router.refresh();
      }
    });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Send className="size-4" /> {t("send")}
      </Button>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="font-medium">{t("sendTitle")}</h3>
        <p className="text-muted-foreground text-sm">{t("sendDesc")}</p>
      </div>

      <Input
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder={t("sendRecipient")}
        dir="ltr"
      />
      <Input
        type="number"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={t("sendAmount", { balance: formatUsd(balance, locale) })}
        dir="ltr"
        className="sm:w-56"
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("sendNote")}
      />

      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}

      <div className="flex gap-2">
        <Button disabled={pending || !recipient || !amount} onClick={submit}>
          {pending ? t("submitting") : t("sendSubmit")}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </section>
  );
}
