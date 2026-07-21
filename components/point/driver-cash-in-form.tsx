"use client";

import { useState, useTransition } from "react";
import { HandCoins } from "lucide-react";
import { useTranslations } from "next-intl";

import { pointDriverCashIn } from "@/lib/actions/point";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Driver = { id: string; name: string };

// The counter records COD cash a courier hands in (docs §12). The driver's
// cash-on-hand drops and the point's cash-to-remit rises in one step.
export function DriverCashInForm({ drivers }: { drivers: Driver[] }) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [driverId, setDriverId] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () =>
    start(async () => {
      setErr(null);
      setDone(false);
      const res = await pointDriverCashIn(driverId, Number(amount));
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        setAmount("");
        router.refresh();
      }
    });

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <HandCoins className="size-4" /> {t("cashInTitle")}
      </p>
      <p className="text-muted-foreground text-xs">{t("cashInHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="h-10 flex-1 basis-40 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">{t("pickDriver")}</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Input
          type="number"
          step="0.01"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          dir="ltr"
          className="h-10 w-28"
        />
        <Button
          onClick={submit}
          disabled={pending || !driverId || !(Number(amount) > 0)}
          className="h-10"
        >
          {pending ? t("saving") : t("cashInSubmit")}
        </Button>
      </div>
      {done ? (
        <p className="text-xs text-emerald-600">{t("cashInDone")}</p>
      ) : null}
      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
