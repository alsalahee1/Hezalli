"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { setCourierDeposit, setPointDeposit } from "@/lib/actions/deposit";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Admin records the security deposit held from a courier or a point operator.
// The amount REPLACES the stored deposit (it is a balance, not an increment);
// zero clears it.
export function DepositForm({
  target,
  targetId,
  current,
}: {
  target: "courier" | "point";
  targetId: string;
  current: number;
}) {
  const t = useTranslations("AdminDeposits");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set(target === "courier" ? "courierId" : "pointId", targetId);
    setErr(null);
    setDone(false);
    start(async () => {
      const action = target === "courier" ? setCourierDeposit : setPointDeposit;
      const res = await action(form);
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="depositAmount">{t("amount")}</Label>
        <Input
          id="depositAmount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          required
          dir="ltr"
          defaultValue={current > 0 ? current.toFixed(2) : ""}
          placeholder="0.00"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="depositNote">{t("note")}</Label>
        <Input
          id="depositNote"
          name="note"
          placeholder={t("notePlaceholder")}
        />
      </div>

      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}
      {done ? <p className="text-sm text-emerald-600">{t("saved")}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
