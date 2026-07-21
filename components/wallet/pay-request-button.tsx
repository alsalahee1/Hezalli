"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { payPaymentRequest } from "@/lib/actions/wallet-request";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { WalletAuthField } from "@/components/wallet/wallet-auth-field";
import { ShareReceiptButton } from "@/components/wallet/share-receipt-button";
import type { WalletAuth } from "@/lib/wallet-step-auth";

export function PayRequestButton({
  requestId,
  amountLabel,
  hasPin,
  hasPasskey,
}: {
  requestId: string;
  amountLabel: string;
  hasPin: boolean;
  hasPasskey: boolean;
}) {
  const t = useTranslations("Wallet");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [entryId, setEntryId] = useState<string | null>(null);

  const run = (auth: WalletAuth) =>
    start(async () => {
      setErr(null);
      const res = await payPaymentRequest(requestId, auth);
      if (res.error) setErr(res.error);
      else {
        // Stay put so the payer can share the receipt before leaving.
        setEntryId(res.entryId ?? null);
        setDone(true);
      }
    });

  if (done) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
          <CheckCircle2 className="size-8 text-emerald-600" />
          <p className="font-medium">{t("requestPaid")}</p>
        </div>
        {entryId ? <ShareReceiptButton entryId={entryId} /> : null}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push("/account/wallet")}
        >
          {t("backToWallet")}
        </Button>
      </div>
    );
  }

  return (
    <WalletAuthField
      hasPin={hasPin}
      hasPasskey={hasPasskey}
      pending={pending}
      error={err}
      submitLabel={t("payRequestCta", { amount: amountLabel })}
      onAuthorize={run}
      fullWidth
    />
  );
}
