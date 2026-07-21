"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { offsetEarningsAgainstCod } from "@/lib/actions/courier-ledger";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

// One-click netting: settle the driver's COD cash debt out of their accrued
// earnings — min(cash held, earnings owed), computed server-side.
export function CourierOffsetForm({
  courierId,
  offsetable,
}: {
  courierId: string;
  offsetable: number;
}) {
  const t = useTranslations("AdminCouriers");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const form = new FormData();
    form.set("courierId", courierId);
    setErr(null);
    start(async () => {
      const res = await offsetEarningsAgainstCod(form);
      if (res.error) setErr(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={submit}
        disabled={pending || offsetable <= 0}
      >
        {pending ? t("recording") : t("offsetBtn")}
      </Button>
      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
