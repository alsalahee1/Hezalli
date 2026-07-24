"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { requestTopUp } from "@/lib/actions/wallet-topup";
import { formatUsd } from "@/lib/products";
import { useRouter } from "@/i18n/navigation";
import {
  useDisplayCurrency,
  useMoney,
} from "@/components/currency/currency-provider";
import { WALLET_OPEN_TOPUP } from "@/components/wallet/wallet-tab-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";

type Method = "LOCAL_WALLET" | "BANK_TRANSFER" | "USDT";
const METHODS: Method[] = ["LOCAL_WALLET", "BANK_TRANSFER", "USDT"];

export function WalletTopUpForm({ min, max }: { min: number; max: number }) {
  const t = useTranslations("Wallet");
  const tp = useTranslations("Payment");
  const locale = useLocale();
  const router = useRouter();
  const fmt = useMoney();
  const display = useDisplayCurrency();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("LOCAL_WALLET");
  const [reference, setReference] = useState("");
  const [txHash, setTxHash] = useState("");
  const [network, setNetwork] = useState<"TRC20" | "ERC20">("TRC20");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // The wallet bottom bar opens this form by firing a window event.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(WALLET_OPEN_TOPUP, onOpen);
    return () => window.removeEventListener(WALLET_OPEN_TOPUP, onOpen);
  }, []);

  const isUsdt = method === "USDT";

  // Quick-pick amounts within the allowed [min, max] range.
  const presets = [5, 10, 25, 50, 100, 200].filter((n) => n >= min && n <= max);

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await requestTopUp({
        amountUsd: Number(amount),
        method,
        reference: isUsdt ? undefined : reference,
        usdtTxHash: isUsdt ? txHash : undefined,
        usdtNetwork: isUsdt ? network : undefined,
      });
      if (res.error) setErr(res.error);
      else {
        setOpen(false);
        setAmount("");
        setReference("");
        setTxHash("");
        router.refresh();
      }
    });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {t("topUp")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeLabel={t("cancel")}
      >
        <div className="space-y-3">
          <div>
            <h3 className="font-medium">{t("topUpTitle")}</h3>
            <p className="text-muted-foreground text-sm">{t("topUpDesc")}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("amount")}
              dir="ltr"
              className="sm:w-40"
            />
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
              className="flex-1"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`method_${m}`)}
                </option>
              ))}
            </Select>
          </div>
          {display.code !== "USD" && Number(amount) > 0 ? (
            <p className="text-muted-foreground text-xs" dir="ltr">
              ≈ {fmt(Number(amount))}
            </p>
          ) : null}
          {presets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {presets.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAmount(String(n))}
                  className={
                    Number(amount) === n
                      ? "border-primary bg-primary/10 text-primary min-h-10 rounded-full border px-3.5 py-2 text-sm font-semibold"
                      : "hover:border-muted-foreground/40 min-h-10 rounded-full border px-3.5 py-2 text-sm"
                  }
                  dir="ltr"
                >
                  {formatUsd(n, locale)}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("limits", {
              min: formatUsd(min, locale),
              max: formatUsd(max, locale),
            })}
          </p>

          {/* Where to send the money (platform rail details). */}
          <div className="bg-muted/40 rounded-md p-3 text-sm">
            <p className="font-medium">{tp(`dest_${method}_title`)}</p>
            <p className="text-muted-foreground whitespace-pre-line">
              {tp(`dest_${method}_body`)}
            </p>
          </div>

          {isUsdt ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={network}
                onChange={(e) =>
                  setNetwork(e.target.value as "TRC20" | "ERC20")
                }
                className="sm:w-32"
              >
                <option value="TRC20">TRC20</option>
                <option value="ERC20">ERC20</option>
              </Select>
              <Input
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder={tp("txHash")}
                dir="ltr"
                className="flex-1"
              />
            </div>
          ) : (
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={tp("reference")}
            />
          )}

          {err ? (
            <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
          ) : null}

          <Button disabled={pending || !amount} onClick={submit}>
            {pending ? t("submitting") : t("topUpSubmit")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
