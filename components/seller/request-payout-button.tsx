"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { requestPayout } from "@/lib/actions/payout";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function RequestPayoutButton({ disabled }: { disabled: boolean }) {
  const t = useTranslations("SellerFinance");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const onClick = () =>
    start(async () => {
      setErr(null);
      const res = await requestPayout();
      if (res.error) setErr(res.error);
      else {
        setOk(true);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" disabled={disabled || pending} onClick={onClick}>
        {t("requestPayout")}
      </Button>
      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
      {ok && !err ? (
        <p className="text-xs text-emerald-600">{t("requested")}</p>
      ) : null}
    </div>
  );
}
