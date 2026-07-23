"use client";

import { useState, useTransition } from "react";
import { HandCoins, QrCode } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { pointDriverCashIn } from "@/lib/actions/point";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DriverQrScanner } from "@/components/point/driver-qr-scanner";

type Driver = { id: string; name: string; cashOnHand: number };

// The counter records COD cash a courier hands in (docs §12). The driver's
// cash-on-hand drops and the point's cash-to-remit rises in one step. The
// operator scans the driver's collection QR (or picks from the list), then
// takes all the cash the driver is holding or a custom amount.
export function DriverCashInForm({ drivers }: { drivers: Driver[] }) {
  const t = useTranslations("Point");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [driverId, setDriverId] = useState("");
  const [amount, setAmount] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const money = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(n);

  const selected = drivers.find((d) => d.id === driverId);
  const onHand = selected?.cashOnHand ?? 0;
  const value = Number(amount);
  const overRemit = value > onHand + 0.001;

  const onScan = (id: string) => {
    setScanOpen(false);
    setDone(false);
    if (drivers.some((d) => d.id === id)) {
      setDriverId(id);
      setAmount("");
      setErr(null);
    } else {
      setErr("invalidDriver");
    }
  };

  const submit = () =>
    start(async () => {
      setErr(null);
      setDone(false);
      const res = await pointDriverCashIn(driverId, value);
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
        {/* Scanning the driver's collection QR is the fast path; the list keeps
            camera-less counters working. */}
        <Button
          type="button"
          variant="outline"
          onClick={() => setScanOpen(true)}
          className="h-10"
        >
          <QrCode className="size-4" /> {t("cashInScan")}
        </Button>
        <select
          value={driverId}
          onChange={(e) => {
            setDriverId(e.target.value);
            setAmount("");
            setDone(false);
            setErr(null);
          }}
          className="h-10 flex-1 basis-40 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">{t("pickDriver")}</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Once a driver is chosen, show what they're holding and a one-tap
          "collect all" that fills the amount with their full cash-on-hand. */}
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
          <span className="text-xs">
            {t("cashInOnHand", { amount: money(onHand) })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={onHand <= 0}
            onClick={() => setAmount(onHand.toFixed(2))}
          >
            {t("cashInCollectAll", { amount: money(onHand) })}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
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
          disabled={pending || !driverId || !(value > 0) || overRemit}
          className="h-10"
        >
          {pending ? t("saving") : t("cashInSubmit")}
        </Button>
      </div>

      {overRemit ? (
        <p className="text-destructive text-xs">{t("err_overRemit")}</p>
      ) : null}
      {done ? (
        <p className="text-xs text-emerald-600">{t("cashInDone")}</p>
      ) : null}
      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}

      <DriverQrScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetect={onScan}
      />
    </div>
  );
}
