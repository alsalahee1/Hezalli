"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { recordPointPayout } from "@/lib/actions/point-ledger";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Admin records a payout to a point operator or a manual ± adjustment against
// the point's ledger. Mirrors CourierRemittanceForm.
export function PointPayoutForm({ pointId }: { pointId: string }) {
  const t = useTranslations("AdminPoints");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<"payout" | "remittance" | "adjustment">(
    "payout",
  );

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("pointId", pointId);
    form.set("kind", kind);
    setErr(null);
    start(async () => {
      const res = await recordPointPayout(form);
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
        {(["payout", "remittance", "adjustment"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={
              "min-h-9 rounded-full border px-3 py-2 text-xs font-medium " +
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
            {kind === "payout"
              ? t("payoutAmount")
              : kind === "remittance"
                ? t("remitAmount")
                : t("adjustAmount")}
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

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("saving") : t("record")}
      </Button>
    </form>
  );
}
