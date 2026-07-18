"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { cancelOrder } from "@/lib/actions/order";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    if (!confirm(t("cancelConfirm"))) return;
    start(async () => {
      setErr(null);
      const res = await cancelOrder(orderId);
      if (res.error) setErr(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        disabled={pending}
        onClick={onClick}
      >
        {t("cancelOrder")}
      </Button>
      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
