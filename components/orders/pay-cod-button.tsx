"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";

import { payCodWithWallet } from "@/lib/actions/pay-cod";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

// Doorstep digital payment (docs §39): settle a COD order from the HezalliPay
// balance so no cash is needed at delivery. Shown only while the order is
// still fully payable (server decides); the wallet balance check is
// authoritative server-side.
export function PayCodButton({
  orderId,
  amount, // pre-formatted currency string
  balance, // pre-formatted currency string
  canCover,
}: {
  orderId: string;
  amount: string;
  balance: string;
  canCover: boolean;
}) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const pay = () =>
    start(async () => {
      setErr(null);
      const res = await payCodWithWallet(orderId);
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  return (
    <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-500">
        <Wallet className="size-4" /> {t("payCodTitle")}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        {t("payCodHint", { amount, balance })}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={pay} disabled={pending || !canCover}>
          {pending ? t("payCodPaying") : t("payCodBtn", { amount })}
        </Button>
        {!canCover ? (
          <span className="text-muted-foreground text-xs">
            {t("payCodLowBalance")}
          </span>
        ) : null}
      </div>
      {err ? (
        <p className="text-destructive mt-2 text-xs">
          {t(`err_paycod_${err}`)}
        </p>
      ) : null}
    </section>
  );
}
