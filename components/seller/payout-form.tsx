"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { savePayoutMethod, type FormState } from "@/lib/actions/payout";
import { WALLET_PROVIDERS } from "@/lib/validations/payout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

export type PayoutData = {
  kind: string;
  details: Record<string, string>;
} | null;

type Kind = "bank" | "wallet" | "usdt";

export function PayoutForm({ current }: { current: PayoutData }) {
  const t = useTranslations("Payout");
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>((current?.kind as Kind) ?? "wallet");
  const [state, action, pending] = useActionState<FormState, FormData>(
    savePayoutMethod,
    {},
  );
  const d = (key: string) =>
    current?.kind === kind ? (current.details[key] ?? "") : "";
  const err = (key: string) => state.errors?.[key];

  useEffect(() => {
    if (state.ok) toast(t("saved"));
  }, [state, t, toast]);

  return (
    <form action={action} className="max-w-lg space-y-4" noValidate>
      {state.formError ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
        >
          {t(state.formError)}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="kind">{t("method")}</Label>
        <Select
          id="kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
        >
          <option value="wallet">{t("kindWallet")}</option>
          <option value="bank">{t("kindBank")}</option>
          <option value="usdt">{t("kindUsdt")}</option>
        </Select>
      </div>

      {kind === "bank" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="bankName">{t("bankName")}</Label>
            <Input
              id="bankName"
              name="bankName"
              defaultValue={d("bankName")}
              aria-invalid={Boolean(err("bankName"))}
            />
            {err("bankName") ? (
              <p className="text-destructive text-xs">{t(err("bankName")!)}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountName">{t("accountName")}</Label>
            <Input
              id="accountName"
              name="accountName"
              defaultValue={d("accountName")}
              aria-invalid={Boolean(err("accountName"))}
            />
            {err("accountName") ? (
              <p className="text-destructive text-xs">
                {t(err("accountName")!)}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountNumber">{t("accountNumber")}</Label>
            <Input
              id="accountNumber"
              name="accountNumber"
              dir="ltr"
              defaultValue={d("accountNumber")}
              aria-invalid={Boolean(err("accountNumber"))}
            />
            {err("accountNumber") ? (
              <p className="text-destructive text-xs">
                {t(err("accountNumber")!)}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {kind === "wallet" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="provider">{t("provider")}</Label>
            <Select
              id="provider"
              name="provider"
              defaultValue={d("provider") || "Jawali"}
              aria-invalid={Boolean(err("provider"))}
            >
              {WALLET_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            {err("provider") ? (
              <p className="text-destructive text-xs">{t(err("provider")!)}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountName">{t("accountName")}</Label>
            <Input
              id="accountName"
              name="accountName"
              defaultValue={d("accountName")}
              aria-invalid={Boolean(err("accountName"))}
            />
            {err("accountName") ? (
              <p className="text-destructive text-xs">
                {t(err("accountName")!)}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walletNumber">{t("walletNumber")}</Label>
            <Input
              id="walletNumber"
              name="walletNumber"
              type="tel"
              dir="ltr"
              placeholder="+967 7XX XXX XXX"
              defaultValue={d("walletNumber")}
              aria-invalid={Boolean(err("walletNumber"))}
            />
            {err("walletNumber") ? (
              <p className="text-destructive text-xs">
                {t(err("walletNumber")!)}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {kind === "usdt" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="network">{t("network")}</Label>
            <Select
              id="network"
              name="network"
              defaultValue={d("network") || "TRC20"}
              aria-invalid={Boolean(err("network"))}
            >
              <option value="TRC20">TRC20 (Tron)</option>
              <option value="ERC20">ERC20 (Ethereum)</option>
            </Select>
            {err("network") ? (
              <p className="text-destructive text-xs">{t(err("network")!)}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">{t("address")}</Label>
            <Input
              id="address"
              name="address"
              dir="ltr"
              className="font-mono"
              defaultValue={d("address")}
              aria-invalid={Boolean(err("address"))}
            />
            {err("address") ? (
              <p className="text-destructive text-xs">{t(err("address")!)}</p>
            ) : null}
          </div>
        </>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
