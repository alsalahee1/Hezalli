"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { recordRemittance } from "@/lib/actions/courier-ledger";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Admin records a cash hand-in (remittance) or a manual ± adjustment against a
// courier's ledger. Keeps the driver's cash-on-hand accurate.
export function CourierRemittanceForm({ courierId }: { courierId: string }) {
  const t = useTranslations("AdminCouriers");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<"remittance" | "adjustment">("remittance");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("courierId", courierId);
    form.set("kind", kind);
    setErr(null);
    start(async () => {
      const res = await recordRemittance(form);
      if (res.error) setErr(res.error);
      else {
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex gap-2">
        {(["remittance", "adjustment"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={
              "rounded-full border px-3 py-1 text-xs font-medium " +
              (kind === k
                ? "border-primary bg-primary/5 text-foreground"
                : "text-muted-foreground")
            }
          >
            {t(`kind_${k}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="amount">
            {kind === "remittance" ? t("remitAmount") : t("adjustAmount")}
          </Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            required
            dir="ltr"
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note">{t("note")}</Label>
          <Input id="note" name="note" placeholder={t("notePlaceholder")} />
        </div>
      </div>

      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("recording") : t("record")}
      </Button>
    </form>
  );
}
