"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { confirmReceived } from "@/lib/actions/completion";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function ConfirmReceivedButton({ orderId }: { orderId: string }) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const onClick = async () => {
    if (
      !(await confirm(t("confirmReceivedConfirm"), {
        title: t("confirmReceivedTitle"),
        confirmLabel: t("confirmReceived"),
      }))
    )
      return;
    start(async () => {
      setErr(null);
      const res = await confirmReceived(orderId);
      if (res.error) setErr(res.error);
      else router.refresh();
    });
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {dialog}
      <Button size="sm" disabled={pending} onClick={onClick}>
        <CheckCircle2 className="size-4" /> {t("confirmReceived")}
      </Button>
      {err ? (
        <span className="text-destructive text-xs">{t(`err_${err}`)}</span>
      ) : null}
    </span>
  );
}
