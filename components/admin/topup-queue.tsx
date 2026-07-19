"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { confirmTopUp, rejectTopUp } from "@/lib/actions/wallet-topup";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type TopUpRow = {
  id: string;
  buyerName: string;
  method: string;
  amountLabel: string;
  reference: string | null;
  usdt: string | null;
};

export function TopUpQueue({ rows }: { rows: TopUpRow[] }) {
  const t = useTranslations("AdminPayments");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      await fn();
      setRejecting(null);
      setReason("");
      router.refresh();
    });

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
        {t("topUpsEmpty")}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((p) => (
        <li key={p.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium">{p.buyerName}</p>
              <p className="text-muted-foreground">
                {t(`method_${p.method}`)} · {p.amountLabel}
              </p>
              {p.reference ? (
                <p className="text-muted-foreground text-xs">
                  {t("reference")}: {p.reference}
                </p>
              ) : null}
              {p.usdt ? (
                <p className="text-muted-foreground text-xs break-all" dir="ltr">
                  {p.usdt}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => confirmTopUp(p.id))}
              >
                {t("confirm")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={pending}
                onClick={() => setRejecting((v) => (v === p.id ? null : p.id))}
              >
                {t("reject")}
              </Button>
            </div>
          </div>
          {rejecting === p.id ? (
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("rejectReason")}
                className="h-9 max-w-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={pending}
                onClick={() => run(() => rejectTopUp(p.id, reason))}
              >
                {t("confirmReject")}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
