"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  completeBillPayment,
  failBillPayment,
} from "@/lib/actions/wallet-bills";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BillRow = {
  id: string;
  buyerName: string;
  kind: "BILL" | "AIRTIME";
  billerName: string;
  account: string;
  amountLabel: string;
};

export function BillQueue({ rows }: { rows: BillRow[] }) {
  const t = useTranslations("AdminPayments");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failing, setFailing] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      await fn();
      setFailing(null);
      setReference("");
      setReason("");
      router.refresh();
    });

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
        {t("billsEmpty")}
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
                {t(p.kind === "AIRTIME" ? "billsKindAirtime" : "billsKindBill")}{" "}
                · {p.billerName} · {p.amountLabel}
              </p>
              <p className="text-muted-foreground text-xs" dir="ltr">
                {p.account}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={failing === p.id ? reason : reference}
                onChange={(e) =>
                  failing === p.id
                    ? setReason(e.target.value)
                    : setReference(e.target.value)
                }
                placeholder={
                  failing === p.id ? t("billsFailReason") : t("billsReference")
                }
                className="h-9 max-w-[10rem]"
              />
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => completeBillPayment(p.id, reference))}
              >
                {t("billsComplete")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={pending}
                onClick={() =>
                  failing === p.id
                    ? run(() => failBillPayment(p.id, reason))
                    : setFailing(p.id)
                }
              >
                {failing === p.id ? t("billsConfirmFail") : t("billsFail")}
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
