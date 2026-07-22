"use client";

import { useState, useTransition } from "react";
import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

type MoveResult = { ok?: boolean; error?: string; moved?: number };

/**
 * "Move earnings to wallet" button for the driver and point apps. Calls the
 * given server action (which sweeps the whole free balance), then refreshes so
 * the ledger and the header wallet reflect the move. Shared by both centers;
 * the `namespace` selects the localized labels (Driver | Point).
 */
export function MoveEarningsToWallet({
  action,
  namespace,
  disabled = false,
}: {
  action: () => Promise<MoveResult>;
  namespace: "Driver" | "Point";
  disabled?: boolean;
}) {
  const t = useTranslations(namespace);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const onClick = () =>
    start(async () => {
      setErr(null);
      setOk(false);
      const res = await action();
      if (res.error) setErr(res.error);
      else {
        setOk(true);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || pending}
        onClick={onClick}
      >
        <Wallet className="size-4" /> {t("moveToWallet")}
      </Button>
      {err ? (
        <p className="text-destructive text-xs">{t(`moveErr_${err}`)}</p>
      ) : null}
      {ok && !err ? (
        <p className="text-xs text-emerald-600">{t("moved")}</p>
      ) : null}
    </div>
  );
}
