"use client";

import { useState, useTransition } from "react";
import { HandCoins } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { createPaymentRequest } from "@/lib/actions/wallet-request";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ReferralLink } from "@/components/account/referral-link";

export function WalletRequestForm() {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await createPaymentRequest({
        amountUsd: Number(amount),
        note: note || undefined,
      });
      if (res.error || !res.id) setErr(res.error ?? "badAmount");
      else {
        setLink(`${window.location.origin}/${locale}/pay/r/${res.id}`);
        router.refresh();
      }
    });

  const close = () => {
    setLink(null);
    setOpen(false);
    setAmount("");
    setNote("");
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <HandCoins className="size-4" /> {t("request")}
      </Button>
      <Modal open={open} onClose={close} closeLabel={t("cancel")}>
        <div className="space-y-3">
          <div>
            <h3 className="font-medium">{t("requestTitle")}</h3>
            <p className="text-muted-foreground text-sm">{t("requestDesc")}</p>
          </div>

          {link ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-emerald-600">
                {t("requestCreated")}
              </p>
              <ReferralLink
                url={link}
                copyLabel={t("copyLink")}
                copiedLabel={t("copied")}
              />
              <Button variant="ghost" onClick={close}>
                {t("done")}
              </Button>
            </div>
          ) : (
            <>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("requestAmount")}
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
                <Button disabled={pending || !amount} onClick={submit}>
                  {pending ? t("submitting") : t("requestCreate")}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
