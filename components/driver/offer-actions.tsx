"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { courierRespondOffer } from "@/lib/actions/courier";
import { useRouter } from "@/i18n/navigation";

const DECLINE_REASONS = ["too_far", "off_duty", "too_many_jobs", "other"];

// Accept / decline controls for a job that is only OFFERED to the driver
// (docs/EXPRESS-DELIVERY.md). Declining asks for a reason first; an
// unanswered offer expires at `expiresAt` and moves to another courier.
export function OfferActions({
  shipmentId,
  expiresAt,
}: {
  shipmentId: string;
  expiresAt: Date;
}) {
  const t = useTranslations("Driver");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [err, setErr] = useState(false);

  const respond = (response: "ACCEPT" | "DECLINE", reason?: string) =>
    start(async () => {
      setErr(false);
      const res = await courierRespondOffer(shipmentId, response, reason);
      if (res.error) setErr(true);
      else router.refresh();
    });

  return (
    <div className="rounded-b-xl border border-t-0 border-amber-500/50 bg-amber-500/10 p-3">
      <p className="text-sm font-medium text-amber-700 dark:text-amber-500">
        {t("offerTitle")}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {t("offerExpires", {
          time: format.dateTime(expiresAt, {
            hour: "numeric",
            minute: "2-digit",
          }),
        })}
      </p>
      {declining ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {DECLINE_REASONS.map((r) => (
            <button
              key={r}
              disabled={pending}
              onClick={() => respond("DECLINE", r)}
              className="min-h-10 rounded-full border px-3.5 py-2 text-xs font-medium disabled:opacity-50"
            >
              {t(`declineReason_${r}`)}
            </button>
          ))}
          <button
            disabled={pending}
            onClick={() => setDeclining(false)}
            className="text-muted-foreground flex min-h-10 items-center px-2 py-1.5 text-xs"
          >
            {t("offerBack")}
          </button>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            disabled={pending}
            onClick={() => respond("ACCEPT")}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Check className="size-4" /> {t("offerAccept")}
          </button>
          <button
            disabled={pending}
            onClick={() => setDeclining(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <X className="size-4" /> {t("offerDecline")}
          </button>
        </div>
      )}
      {err ? (
        <p className="text-destructive mt-2 text-xs">{t("offerError")}</p>
      ) : null}
    </div>
  );
}
