"use client";

import { useState, useTransition } from "react";
import { Banknote } from "lucide-react";
import { useTranslations } from "next-intl";

import { requestPointPayout } from "@/lib/actions/point-payout";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The operator asks to be paid their earnings (docs §22). Leaving the amount
// empty requests the whole free balance; the server enforces min/max and the
// one-open-request rule, so this form only relays its errors.
export function PayoutRequestForm({
  free,
  hasOpen,
}: {
  free: number;
  hasOpen: boolean;
}) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () =>
    start(async () => {
      setErr(null);
      setDone(false);
      const n = Number(amount);
      const res = await requestPointPayout(n > 0 ? n : undefined);
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        setAmount("");
        router.refresh();
      }
    });

  if (hasOpen) {
    return (
      <div className="rounded-xl border border-dashed p-3">
        <p className="text-muted-foreground text-sm">{t("payoutOpen")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Banknote className="size-4" /> {t("payoutTitle")}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("payoutHint", { free: free.toFixed(2) })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          step="0.01"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={free.toFixed(2)}
          dir="ltr"
          className="h-10 w-32"
        />
        <Button
          onClick={submit}
          disabled={pending || free <= 0}
          className="h-10"
        >
          {pending ? t("saving") : t("payoutSubmit")}
        </Button>
      </div>
      {done ? (
        <p className="text-xs text-emerald-600">{t("payoutDone")}</p>
      ) : null}
      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
