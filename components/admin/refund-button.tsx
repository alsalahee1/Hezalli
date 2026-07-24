"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { refundSubOrder } from "@/lib/actions/refund";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RefundButton({
  subOrderId,
  maxAmount,
  alreadyRefunded,
}: {
  subOrderId: string;
  maxAmount: number;
  alreadyRefunded: boolean;
}) {
  const t = useTranslations("AdminOrders");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [toWallet, setToWallet] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (alreadyRefunded) {
    return (
      <span className="text-muted-foreground text-xs">{t("refunded")}</span>
    );
  }

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await refundSubOrder(
        subOrderId,
        reason,
        amount ? Number(amount) : undefined,
        toWallet,
      );
      if (res.error) setErr(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        onClick={() => setOpen((v) => !v)}
      >
        {t("refund")}
      </Button>
      {open ? (
        <div className="flex flex-col items-end gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("refundReason")}
            className="w-56"
          />
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("refundAmount", { max: maxAmount })}
            className="w-56"
            dir="ltr"
          />
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={toWallet}
              onChange={(e) => setToWallet(e.target.checked)}
            />
            {t("refundToWallet")}
          </label>
          <Button
            size="sm"
            disabled={pending || reason.trim().length < 3}
            onClick={submit}
          >
            {t("confirmRefund")}
          </Button>
          {err ? (
            <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
