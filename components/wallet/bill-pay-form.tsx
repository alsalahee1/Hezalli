"use client";

import { useState, useTransition } from "react";
import {
  Droplets,
  Phone,
  Receipt,
  Smartphone,
  Wifi,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { payBill } from "@/lib/actions/wallet-bills";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { WalletAuthField } from "@/components/wallet/wallet-auth-field";
import type { WalletAuth } from "@/lib/wallet-step-auth";

type Kind = "BILL" | "AIRTIME";
export type BillerOption = { slug: string; kind: Kind; name: string };

// Per-service icon + accent. Stands in for brand logos until real artwork is
// supplied; the shape (icon in a tinted tile) reads like a bill-pay app.
const SERVICE: Record<string, { icon: LucideIcon; tile: string }> = {
  "public-electricity": { icon: Zap, tile: "bg-amber-500/10 text-amber-600" },
  "local-water": { icon: Droplets, tile: "bg-sky-500/10 text-sky-600" },
  "yemen-net": { icon: Wifi, tile: "bg-emerald-500/10 text-emerald-600" },
  "adsl-landline": { icon: Phone, tile: "bg-violet-500/10 text-violet-600" },
  "yemen-mobile": { icon: Smartphone, tile: "bg-red-500/10 text-red-600" },
  sabafon: { icon: Smartphone, tile: "bg-blue-500/10 text-blue-600" },
  "you-yemen": { icon: Smartphone, tile: "bg-orange-500/10 text-orange-600" },
  "mtn-yemen": { icon: Smartphone, tile: "bg-yellow-500/10 text-yellow-600" },
};
const FALLBACK = { icon: Receipt, tile: "bg-muted text-muted-foreground" };
const serviceOf = (slug: string) => SERVICE[slug] ?? FALLBACK;

export function BillPayForm({
  billers,
  balance,
  hasPin,
  hasPasskey,
}: {
  billers: BillerOption[];
  balance: number;
  hasPin: boolean;
  hasPasskey: boolean;
}) {
  const t = useTranslations("Wallet");
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<BillerOption | null>(null);
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const presets = [5, 10, 20, 50].filter((n) => n <= balance);
  const bills = billers.filter((b) => b.kind === "BILL");
  const airtime = billers.filter((b) => b.kind === "AIRTIME");

  const close = () => {
    setSelected(null);
    setAccount("");
    setAmount("");
    setErr(null);
  };

  const run = (auth: WalletAuth) =>
    start(async () => {
      if (!selected) return;
      setErr(null);
      const res = await payBill({
        kind: selected.kind,
        biller: selected.slug,
        account,
        amountUsd: Number(amount),
        ...auth,
      });
      if (res.error) setErr(res.error);
      else {
        close();
        router.refresh();
      }
    });

  const Grid = ({ items }: { items: BillerOption[] }) => (
    <div className="grid grid-cols-4 gap-3">
      {items.map((b) => {
        const { icon: Icon, tile } = serviceOf(b.slug);
        return (
          <button
            key={b.slug}
            type="button"
            onClick={() => setSelected(b)}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <span
              className={cn(
                "flex size-14 items-center justify-center rounded-2xl transition-transform active:scale-95",
                tile,
              )}
            >
              <Icon className="size-6" aria-hidden />
            </span>
            <span className="text-muted-foreground line-clamp-2 text-[11px] leading-tight">
              {b.name}
            </span>
          </button>
        );
      })}
    </div>
  );

  const active = selected ? serviceOf(selected.slug) : null;
  const ActiveIcon = active?.icon;

  return (
    <section className="space-y-3">
      <h2 className="font-medium">{t("billsTitle")}</h2>

      {bills.length > 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">{t("billsKindBill")}</p>
          <Grid items={bills} />
        </div>
      ) : null}

      {airtime.length > 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("billsKindAirtime")}
          </p>
          <Grid items={airtime} />
        </div>
      ) : null}

      <Modal open={!!selected} onClose={close} closeLabel={t("cancel")}>
        {selected && ActiveIcon ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  active.tile,
                )}
              >
                <ActiveIcon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="font-medium">{selected.name}</h3>
                <p className="text-muted-foreground text-sm">
                  {t("billsDesc")}
                </p>
              </div>
            </div>

            <Input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={
                selected.kind === "AIRTIME"
                  ? t("billsPhone")
                  : t("billsAccount")
              }
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

            <WalletAuthField
              hasPin={hasPin}
              hasPasskey={hasPasskey}
              disabled={!account || !amount}
              pending={pending}
              error={err}
              submitLabel={t("billsSubmit")}
              onAuthorize={run}
            />
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
