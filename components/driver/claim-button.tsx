"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { courierClaimJob } from "@/lib/actions/courier";
import { useRouter } from "@/i18n/navigation";

// One-tap claim for a parcel on the open job board. First driver wins; a
// loser sees "taken" and the list refreshes so the row disappears.
export function ClaimButton({ shipmentId }: { shipmentId: string }) {
  const t = useTranslations("Driver");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const claim = () =>
    start(async () => {
      setErr(null);
      const res = await courierClaimJob(shipmentId);
      if (res.error) {
        setErr(res.error);
        // A lost race means the row is stale — refresh to drop it.
        if (res.error === "taken" || res.error === "notFound") router.refresh();
      } else {
        router.push(`/driver/job/${shipmentId}`);
      }
    });

  return (
    <div>
      <button
        disabled={pending}
        onClick={claim}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Check className="size-4" />
        {pending ? t("claiming") : t("boardClaim")}
      </button>
      {err ? (
        <p className="text-destructive mt-1.5 text-center text-xs">
          {t(
            [
              "taken",
              "codBlocked",
              "tooManyJobs",
              "noCapacity",
              "notFound",
              "paused",
            ].includes(err)
              ? `err_claim_${err}`
              : "boardError",
          )}
        </p>
      ) : null}
    </div>
  );
}
