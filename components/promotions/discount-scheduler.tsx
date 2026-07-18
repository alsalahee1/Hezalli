"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  clearProductDiscount,
  scheduleProductDiscount,
} from "@/lib/actions/merchandising";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SchedulerProduct = {
  id: string;
  title: string;
  onSale: boolean;
};

export function DiscountScheduler({
  products,
}: {
  products: SchedulerProduct[];
}) {
  const t = useTranslations("Merch");
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [percentOff, setPercentOff] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const selected = products.find((p) => p.id === productId);

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      setSaved(false);
      const res = await fn();
      if (res.error) setErr(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold">{t("scheduleTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("scheduleDesc")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t("product")}
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">—</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.onSale ? " ★" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t("percentOff")}
          <Input
            type="number"
            min={1}
            max={90}
            value={percentOff}
            onChange={(e) => setPercentOff(e.target.value)}
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t("starts")}
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t("ends")}
          <Input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            dir="ltr"
          />
        </label>
      </div>
      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}
      {saved && !err ? (
        <p className="text-sm text-emerald-600">{t("saved")}</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !productId}
          onClick={() =>
            run(() =>
              scheduleProductDiscount({
                productId,
                percentOff: Number(percentOff),
                startsAt,
                endsAt,
              }),
            )
          }
        >
          {t("schedule")}
        </Button>
        {selected?.onSale ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => clearProductDiscount(productId))}
          >
            {t("clear")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
