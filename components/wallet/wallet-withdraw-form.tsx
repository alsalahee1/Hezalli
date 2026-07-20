"use client";

import { useState, useTransition } from "react";
import { ArrowUpFromLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { requestWithdrawal } from "@/lib/actions/wallet-withdrawal";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export function WalletWithdrawForm({
  balance,
  min,
  destination,
}: {
  balance: number;
  min: number;
  destination: string;
}) {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await requestWithdrawal(amount ? Number(amount) : undefined);
      if (res.error) setErr(res.error);
      else {
        setOpen(false);
        setAmount("");
        router.refresh();
      }
    });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowUpFromLine className="size-4" /> {t("withdraw")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeLabel={t("cancel")}
      >
        <div className="space-y-3">
          <div>
            <h3 className="font-medium">{t("withdrawTitle")}</h3>
            <p className="text-muted-foreground text-sm">{t("withdrawDesc")}</p>
          </div>

          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("withdrawAmount", {
              balance: formatUsd(balance, locale),
            })}
            dir="ltr"
            className="sm:w-56"
          />
          <p className="text-muted-foreground text-xs">
            {t("withdrawMin", { min: formatUsd(min, locale) })}
          </p>

          <div className="bg-muted/40 rounded-md p-3 text-sm">
            <p className="text-muted-foreground">{t("withdrawTo")}</p>
            <p className="font-medium" dir="ltr">
              {destination}
            </p>
          </div>

          {err ? (
            <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
          ) : null}

          <div className="flex gap-2">
            <Button disabled={pending} onClick={submit}>
              {pending ? t("submitting") : t("withdrawSubmit")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
