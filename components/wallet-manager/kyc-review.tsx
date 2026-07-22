"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { reviewKyc } from "@/lib/actions/kyc";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Approve / reject buttons for one pending KYC submission. Rejection asks for
// a reason that is passed on to the user.
export function KycReview({ profileId }: { profileId: string }) {
  const t = useTranslations("WalletManager");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const run = (verdict: "VERIFIED" | "REJECTED") =>
    start(async () => {
      setErr(null);
      const res = await reviewKyc(
        profileId,
        verdict,
        verdict === "REJECTED" ? reason : undefined,
      );
      if (res.error) setErr(t(`error_${res.error}`));
      else {
        setRejecting(false);
        setReason("");
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run("VERIFIED")}>
          {t("kycApprove")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={pending}
          onClick={() => setRejecting((v) => !v)}
        >
          {t("kycReject")}
        </Button>
      </div>
      {rejecting ? (
        <div className="flex items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("kycRejectReason")}
            className="h-9 max-w-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={pending}
            onClick={() => run("REJECTED")}
          >
            {t("kycConfirmReject")}
          </Button>
        </div>
      ) : null}
      {err ? <p className="text-destructive text-xs">{err}</p> : null}
    </div>
  );
}
