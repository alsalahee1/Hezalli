"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  submitCourierRemitClaim,
  submitPointRemitClaim,
} from "@/lib/actions/remit-claim";
import { REMIT_METHODS } from "@/lib/remit-methods";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Digital COD remittance claim (docs §38): amount + rail + transfer
// reference. `who` picks the server action; `namespace` the labels
// (Driver | Point). A pending claim is shown by the parent instead of this
// form, so submission state stays simple.
export function RemitClaimForm({
  who,
  namespace,
  max,
}: {
  who: "courier" | "point";
  namespace: "Driver" | "Point";
  max: number;
}) {
  const t = useTranslations(namespace);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setErr(null);
    start(async () => {
      const action =
        who === "courier" ? submitCourierRemitClaim : submitPointRemitClaim;
      const res = await action(form);
      if (res.error) setErr(res.error);
      else {
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          max={max > 0 ? max.toFixed(2) : undefined}
          required
          dir="ltr"
          defaultValue={max > 0 ? max.toFixed(2) : ""}
          placeholder="0.00"
          className="h-9 w-28"
        />
        <select
          name="method"
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
          defaultValue="JAWALI"
        >
          {REMIT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`remitMethod_${m}`)}
            </option>
          ))}
        </select>
        <Input
          name="reference"
          required
          minLength={3}
          placeholder={t("remitReference")}
          className="h-9 flex-1"
          dir="ltr"
        />
        <Button type="submit" size="sm" disabled={pending || max <= 0}>
          {pending ? t("saving") : t("remitSubmit")}
        </Button>
      </div>
      {err ? (
        <p className="text-destructive text-xs">{t(`err_remit_${err}`)}</p>
      ) : null}
    </form>
  );
}
