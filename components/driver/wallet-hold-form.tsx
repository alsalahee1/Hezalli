"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { setWalletCodHold } from "@/lib/actions/wallet-hold";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Self-service COD collateral pledge: the driver locks part of their
// HezalliPay balance to raise their COD cash limit. The amount REPLACES the
// current hold; 0 releases it (only allowed with no COD cash on hand).
export function WalletHoldForm({ current }: { current: number }) {
  const t = useTranslations("Driver");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setErr(null);
    start(async () => {
      const res = await setWalletCodHold(form);
      if (res.error) setErr(res.error);
      else router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <Input
        name="amount"
        type="number"
        step="0.01"
        min="0"
        required
        dir="ltr"
        defaultValue={current > 0 ? current.toFixed(2) : ""}
        placeholder="0.00"
        className="h-9 w-32"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("saving") : t("holdSave")}
      </Button>
      {err ? (
        <p className="text-destructive w-full text-xs">
          {t(`err_hold_${err}`)}
        </p>
      ) : null}
    </form>
  );
}
