"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  adjustWalletBalance,
  setWalletFrozen,
} from "@/lib/actions/wallet-admin";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";

// Staff controls on a wallet detail page: freeze/unfreeze and a manual
// ADJUSTMENT entry (positive credits, negative debits; note mandatory).
export function WalletTools({
  userId,
  frozen,
}: {
  userId: string;
  frozen: boolean;
}) {
  const t = useTranslations("WalletManager");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adjusting, setAdjusting] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(t(`error_${res.error}`));
      else {
        setAdjusting(false);
        setAmount("");
        setNote("");
        router.refresh();
      }
    });

  return (
    <div className="space-y-3 rounded-lg border p-4">
      {dialog}
      <p className="text-sm font-medium">{t("tools")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className={frozen ? "" : "text-destructive"}
          disabled={pending}
          onClick={() => {
            const msg = frozen ? t("unfreezeConfirm") : t("freezeConfirm");
            void confirm(msg, {
              title: frozen ? t("unfreeze") : t("freeze"),
              destructive: !frozen,
            }).then((ok) => {
              if (ok) run(() => setWalletFrozen(userId, !frozen));
            });
          }}
        >
          {frozen ? t("unfreeze") : t("freeze")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setAdjusting((v) => !v)}
        >
          {t("adjust")}
        </Button>
      </div>
      {adjusting ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("adjustAmount")}
            inputMode="decimal"
            dir="ltr"
            className="w-32"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("adjustNote")}
            className="max-w-xs flex-1"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => adjustWalletBalance(userId, Number(amount), note))
            }
          >
            {t("adjustApply")}
          </Button>
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">{t("adjustHint")}</p>
      {err ? <p className="text-destructive text-xs">{err}</p> : null}
    </div>
  );
}
