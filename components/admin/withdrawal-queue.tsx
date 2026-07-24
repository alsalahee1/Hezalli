"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  markWithdrawalPaid,
  rejectWithdrawal,
} from "@/lib/actions/wallet-withdrawal";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type WithdrawalRow = {
  id: string;
  buyerName: string;
  amountLabel: string;
  method: string;
  destination: string;
};

export function WithdrawalQueue({ rows }: { rows: WithdrawalRow[] }) {
  const t = useTranslations("AdminPayouts");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      await fn();
      setActive(null);
      setNote("");
      router.refresh();
    });

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
        {t("withdrawalsEmpty")}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((p) => (
        <li key={p.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {p.buyerName} · {p.amountLabel}
              </p>
              <p className="text-muted-foreground break-all">
                {p.method} · {p.destination}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  setActive((v) => (v === `pay-${p.id}` ? null : `pay-${p.id}`))
                }
              >
                {t("markPaid")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={pending}
                onClick={() =>
                  setActive((v) => (v === `rej-${p.id}` ? null : `rej-${p.id}`))
                }
              >
                {t("reject")}
              </Button>
            </div>
          </div>
          {active === `pay-${p.id}` ? (
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("reference")}
                className="max-w-xs"
              />
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => markWithdrawalPaid(p.id, note))}
              >
                {t("confirmPaid")}
              </Button>
            </div>
          ) : null}
          {active === `rej-${p.id}` ? (
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("rejectReason")}
                className="max-w-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={pending}
                onClick={() => run(() => rejectWithdrawal(p.id, note))}
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
