"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { payPaymentRequest } from "@/lib/actions/wallet-request";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function PayRequestButton({
  requestId,
  amountLabel,
}: {
  requestId: string;
  amountLabel: string;
}) {
  const t = useTranslations("Wallet");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await payPaymentRequest(requestId);
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        setTimeout(() => router.push("/account/wallet"), 1200);
      }
    });

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="font-medium">{t("requestPaid")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {err ? (
        <p className="text-destructive text-center text-sm">
          {t(`err_${err}`)}
        </p>
      ) : null}
      <Button className="w-full" disabled={pending} onClick={submit}>
        {pending
          ? t("submitting")
          : t("payRequestCta", { amount: amountLabel })}
      </Button>
    </div>
  );
}
