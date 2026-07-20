"use client";

import { useState, useTransition } from "react";
import { Lock, Unlock } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  adjustWalletBalance,
  setWalletFrozen,
} from "@/lib/actions/wallet-admin";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WalletAdminControls({
  userId,
  frozen,
  balanceLabel,
}: {
  userId: string;
  frozen: boolean;
  balanceLabel: string;
}) {
  const t = useTranslations("AdminWallet");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<null | "freeze" | "adjust">(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const done = () => {
    setPanel(null);
    setReason("");
    setAmount("");
    setErr(null);
    router.refresh();
  };

  const toggleFreeze = () =>
    start(async () => {
      setErr(null);
      const res = await setWalletFrozen(userId, !frozen, reason);
      if (res.error) setErr(res.error);
      else done();
    });

  const adjust = () =>
    start(async () => {
      setErr(null);
      const res = await adjustWalletBalance(userId, Number(amount), reason);
      if (res.error) setErr(res.error);
      else done();
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs" dir="ltr">
          {balanceLabel}
        </span>
        {frozen ? (
          <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
            {t("frozen")}
          </span>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPanel(panel === "freeze" ? null : "freeze")}
        >
          {frozen ? (
            <Unlock className="size-3.5" />
          ) : (
            <Lock className="size-3.5" />
          )}
          {frozen ? t("unfreeze") : t("freeze")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPanel(panel === "adjust" ? null : "adjust")}
        >
          {t("adjust")}
        </Button>
      </div>

      {panel === "freeze" ? (
        <div className="flex items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reason")}
            className="h-8 w-48 text-sm"
          />
          <Button size="sm" disabled={pending} onClick={toggleFreeze}>
            {frozen ? t("confirmUnfreeze") : t("confirmFreeze")}
          </Button>
        </div>
      ) : null}

      {panel === "adjust" ? (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("amountHint")}
            dir="ltr"
            className="h-8 w-24 text-sm"
          />
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reason")}
            className="h-8 w-40 text-sm"
          />
          <Button
            size="sm"
            disabled={pending || !amount || !reason}
            onClick={adjust}
          >
            {t("apply")}
          </Button>
        </div>
      ) : null}

      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
