"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { resolveDispute, type DisputeOutcome } from "@/lib/actions/dispute";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const OUTCOMES: DisputeOutcome[] = [
  "refund_buyer",
  "partial_refund",
  "release_seller",
  "other",
];

export function DisputeVerdict({
  disputeId,
  maxAmount,
}: {
  disputeId: string;
  maxAmount: number;
}) {
  const t = useTranslations("AdminDisputes");
  const router = useRouter();
  const [outcome, setOutcome] = useState<DisputeOutcome>("refund_buyer");
  const [decision, setDecision] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await resolveDispute({
        disputeId,
        outcome,
        decision,
        amountUsd:
          outcome === "partial_refund" ? Number(amount) || 0 : undefined,
      });
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">{t("verdictTitle")}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {OUTCOMES.map((o) => (
          <label
            key={o}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm",
              outcome === o
                ? "border-primary bg-primary/5"
                : "hover:border-muted-foreground/40",
            )}
          >
            <input
              type="radio"
              name="outcome"
              className="size-4"
              checked={outcome === o}
              onChange={() => setOutcome(o)}
            />
            {t(`outcome_${o}`)}
          </label>
        ))}
      </div>

      {outcome === "partial_refund" ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium">
            {t("amountLabel", { max: maxAmount.toFixed(2) })}
          </span>
          <Input
            type="number"
            min={0}
            max={maxAmount}
            step="0.5"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-40"
            dir="ltr"
          />
        </label>
      ) : null}

      <Textarea
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
        rows={3}
        placeholder={t("decisionPlaceholder")}
      />

      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}
      <Button disabled={pending} onClick={submit}>
        {pending ? t("resolving") : t("resolve")}
      </Button>
    </div>
  );
}
