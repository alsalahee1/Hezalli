"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { submitPaymentProof } from "@/lib/actions/payment";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PaymentProofForm({
  orderId,
  method,
  paymentStatus,
}: {
  orderId: string;
  method: "BANK_TRANSFER" | "USDT" | "WALLET";
  paymentStatus: string;
}) {
  const t = useTranslations("Payment");
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [txHash, setTxHash] = useState("");
  const [network, setNetwork] = useState<"TRC20" | "ERC20">("TRC20");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const awaiting = paymentStatus === "AWAITING_CONFIRMATION";
  const isUsdt = method === "USDT";

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await submitPaymentProof({
        orderId,
        reference: isUsdt ? undefined : reference,
        usdtTxHash: isUsdt ? txHash : undefined,
        usdtNetwork: isUsdt ? network : undefined,
      });
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-2 font-medium">{t("payTitle")}</h3>

      {/* Where to pay (platform details — placeholder until admin settings). */}
      <div className="bg-muted/40 mb-3 rounded-md p-3 text-sm">
        <p className="font-medium">{t(`dest_${method}_title`)}</p>
        <p className="text-muted-foreground whitespace-pre-line">
          {t(`dest_${method}_body`)}
        </p>
      </div>

      {awaiting ? (
        <p className="mb-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          {t("awaiting")}
        </p>
      ) : null}

      {isUsdt ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as "TRC20" | "ERC20")}
            className="bg-background h-10 rounded-md border px-3 text-sm"
          >
            <option value="TRC20">TRC20</option>
            <option value="ERC20">ERC20</option>
          </select>
          <Input
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder={t("txHash")}
            dir="ltr"
            className="flex-1"
          />
        </div>
      ) : (
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={t("reference")}
        />
      )}

      {err ? (
        <p className="text-destructive mt-2 text-sm">{t(`err_${err}`)}</p>
      ) : null}

      <Button className="mt-3" disabled={pending} onClick={submit}>
        {awaiting ? t("resubmit") : t("submitProof")}
      </Button>
    </section>
  );
}
