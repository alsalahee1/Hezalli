"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  saveExchangeRates,
  type ExchangeRateInput,
} from "@/lib/actions/settings";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export type RateRow = {
  currency: ExchangeRateInput["currency"];
  zone: ExchangeRateInput["zone"];
  rate: number;
};

export function ExchangeRatesForm({ current }: { current: RateRow[] }) {
  const t = useTranslations("AdminSettings");
  const router = useRouter();
  const [values, setValues] = useState<string[]>(
    current.map((r) => String(r.rate || "")),
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold">{t("ratesTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("ratesDesc")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {current.map((r, i) => (
          <label key={`${r.currency}-${r.zone}`} className="space-y-1 text-sm">
            <span className="text-muted-foreground block">
              {r.currency === "YER"
                ? `${r.currency} — ${t(`zone_${r.zone}`)}`
                : r.currency}
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="any"
                dir="ltr"
                value={values[i] ?? ""}
                onChange={(e) =>
                  setValues((v) =>
                    v.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
                className="w-full rounded-md border bg-transparent p-2 text-sm outline-none"
              />
              <span className="text-muted-foreground text-xs whitespace-nowrap">
                {t("perUsd")}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setSaved(false);
              setError(false);
              const rows = current.map((r, i) => ({
                currency: r.currency,
                zone: r.zone,
                rate: Number(values[i]),
              }));
              if (rows.some((r) => !Number.isFinite(r.rate) || r.rate <= 0)) {
                setError(true);
                return;
              }
              const res = await saveExchangeRates(rows);
              if (res.error) {
                setError(true);
                return;
              }
              setSaved(true);
              router.refresh();
            })
          }
        >
          {pending ? t("saving") : t("save")}
        </Button>
        {saved && !pending ? (
          <span className="text-sm text-emerald-600">{t("saved")}</span>
        ) : null}
        {error && !pending ? (
          <span className="text-destructive text-sm">{t("ratesInvalid")}</span>
        ) : null}
      </div>
    </div>
  );
}
