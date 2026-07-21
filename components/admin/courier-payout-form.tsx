"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { recordEarningsPayout } from "@/lib/actions/courier-ledger";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Admin pays a courier their accrued delivery-fee earnings. Prefills the full
// owed amount; the admin can pay a partial amount instead.
export function CourierPayoutForm({
  courierId,
  owed,
}: {
  courierId: string;
  owed: number;
}) {
  const t = useTranslations("AdminCouriers");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("courierId", courierId);
    setErr(null);
    start(async () => {
      const res = await recordEarningsPayout(form);
      if (res.error) setErr(res.error);
      else {
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="payoutAmount">{t("payoutAmount")}</Label>
        <Input
          id="payoutAmount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          dir="ltr"
          defaultValue={owed > 0 ? owed.toFixed(2) : ""}
          placeholder="0.00"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="payoutNote">{t("note")}</Label>
        <Input
          id="payoutNote"
          name="note"
          placeholder={t("payoutNotePlaceholder")}
        />
      </div>

      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}

      <Button type="submit" disabled={pending || owed <= 0}>
        {pending ? t("recording") : t("payoutBtn")}
      </Button>
    </form>
  );
}
