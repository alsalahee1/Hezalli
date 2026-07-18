"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { acceptSubOrder, cancelSubOrder } from "@/lib/actions/seller-order";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SellerOrderActions({
  subOrderId,
  status,
}: {
  subOrderId: string;
  status: string;
}) {
  const t = useTranslations("SellerOrders");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else {
        setShowCancel(false);
        router.refresh();
      }
    });

  const cancellable = status === "CONFIRMED" || status === "PROCESSING";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "CONFIRMED" ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => acceptSubOrder(subOrderId))}
          >
            {t("accept")}
          </Button>
        ) : null}
        {cancellable ? (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={pending}
            onClick={() => setShowCancel((v) => !v)}
          >
            {t("cancel")}
          </Button>
        ) : null}
      </div>

      {showCancel ? (
        <div className="flex items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("cancelReason")}
            className="h-9 max-w-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={pending}
            onClick={() => run(() => cancelSubOrder(subOrderId, reason))}
          >
            {t("confirmCancel")}
          </Button>
        </div>
      ) : null}

      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
