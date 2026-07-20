"use client";

import { useMemo, useState, useTransition } from "react";
import { Receipt } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { payBill } from "@/lib/actions/wallet-bills";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletPinField } from "@/components/wallet/wallet-pin-field";

type Kind = "BILL" | "AIRTIME";
export type BillerOption = { slug: string; kind: Kind; name: string };

export function BillPayForm({
  billers,
  balance,
  hasPin,
}: {
  billers: BillerOption[];
  balance: number;
  hasPin: boolean;
}) {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("BILL");
  const [biller, setBiller] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const options = useMemo(
    () => billers.filter((b) => b.kind === kind),
    [billers, kind],
  );
  const presets = [5, 10, 20, 50].filter((n) => n <= balance);

  const pickKind = (k: Kind) => {
    setKind(k);
    setBiller("");
    setErr(null);
  };

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await payBill({
        kind,
        biller: biller || options[0]?.slug || "",
        account,
        amountUsd: Number(amount),
        pin,
      });
      if (res.error) setErr(res.error);
      else {
        setOpen(false);
        setAccount("");
        setAmount("");
        setBiller("");
        setPin("");
        router.refresh();
      }
    });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Receipt className="size-4" /> {t("billsCta")}
      </Button>
    );
  }

  return (
    <section className="w-full space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="font-medium">{t("billsTitle")}</h3>
        <p className="text-muted-foreground text-sm">{t("billsDesc")}</p>
      </div>

      {/* Kind tabs — pay a bill vs top up airtime. */}
      <div className="bg-muted/50 flex gap-1 rounded-md p-1">
        {(["BILL", "AIRTIME"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pickKind(k)}
            className={
              kind === k
                ? "bg-background flex-1 rounded px-3 py-1.5 text-sm font-medium shadow-sm"
                : "text-muted-foreground flex-1 rounded px-3 py-1.5 text-sm"
            }
          >
            {t(k === "BILL" ? "billsKindBill" : "billsKindAirtime")}
          </button>
        ))}
      </div>

      <select
        value={biller || options[0]?.slug || ""}
        onChange={(e) => setBiller(e.target.value)}
        className="bg-background h-10 w-full rounded-md border px-3 text-sm"
      >
        {options.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.name}
          </option>
        ))}
      </select>

      <Input
        value={account}
        onChange={(e) => setAccount(e.target.value)}
        placeholder={kind === "AIRTIME" ? t("billsPhone") : t("billsAccount")}
        dir="ltr"
      />

      <Input
        type="number"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={t("amount")}
        dir="ltr"
      />
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAmount(String(n))}
              className={
                Number(amount) === n
                  ? "border-primary bg-primary/10 text-primary rounded-full border px-3 py-1 text-sm font-semibold"
                  : "hover:border-muted-foreground/40 rounded-full border px-3 py-1 text-sm"
              }
              dir="ltr"
            >
              {formatUsd(n, locale)}
            </button>
          ))}
        </div>
      ) : null}

      <WalletPinField hasPin={hasPin} value={pin} onChange={setPin} />

      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}

      <div className="flex gap-2">
        <Button
          disabled={pending || !account || !amount || !hasPin || pin.length < 4}
          onClick={submit}
        >
          {pending ? t("submitting") : t("billsSubmit")}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </section>
  );
}
