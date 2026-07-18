"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { saveShippingRates } from "@/lib/actions/shipping-rate";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ZoneRate = {
  zoneId: string;
  zoneName: string;
  fee: string; // "" = use platform default
  freeOver: string; // "" = never free
};

export function ShippingRatesForm({
  zones,
  defaultFee,
  defaultFreeOver,
}: {
  zones: ZoneRate[];
  defaultFee: number;
  defaultFreeOver: number;
}) {
  const t = useTranslations("SellerShipping");
  const router = useRouter();
  const [rows, setRows] = useState<ZoneRate[]>(zones);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const set = (zoneId: string, key: "fee" | "freeOver", value: string) =>
    setRows((rs) =>
      rs.map((r) => (r.zoneId === zoneId ? { ...r, [key]: value } : r)),
    );

  const save = () =>
    start(async () => {
      setSaved(false);
      await saveShippingRates(
        rows.map((r) => ({
          zoneId: r.zoneId,
          feeUsd: r.fee.trim() === "" ? null : Number(r.fee),
          freeOver: r.freeOver.trim() === "" ? null : Number(r.freeOver),
        })),
      );
      setSaved(true);
      router.refresh();
    });

  if (zones.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
        {t("noZones")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("defaultHint", {
          fee: `$${defaultFee.toFixed(2)}`,
          over: `$${defaultFreeOver.toFixed(2)}`,
        })}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[440px] text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-3 py-2 text-start font-medium">{t("zone")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("fee")}</th>
              <th className="px-3 py-2 text-start font-medium">
                {t("freeOver")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.zoneId} className="border-t">
                <td className="px-3 py-2 font-medium">{r.zoneName}</td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    inputMode="decimal"
                    value={r.fee}
                    onChange={(e) => set(r.zoneId, "fee", e.target.value)}
                    placeholder={t("defaultPlaceholder")}
                    className="h-9 w-28"
                    dir="ltr"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    inputMode="decimal"
                    value={r.freeOver}
                    onChange={(e) => set(r.zoneId, "freeOver", e.target.value)}
                    placeholder={t("neverPlaceholder")}
                    className="h-9 w-28"
                    dir="ltr"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        {saved && !pending ? (
          <span className="text-sm text-emerald-600">{t("saved")}</span>
        ) : null}
      </div>
    </div>
  );
}
