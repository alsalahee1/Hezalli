"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  markPointPayoutPaid,
  rejectPointPayout,
} from "@/lib/actions/point-payout";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PayoutRequestRow = {
  id: string;
  amountUsd: number;
  status: string;
  note: string | null;
  createdAt: string; // pre-formatted server-side
};

// Resolve a hub's payout requests (docs §22): PAID writes the ledger debit in
// the same transaction server-side; REJECTED records the reason for the hub.
export function PointPayoutRequests({
  requests,
}: {
  requests: PayoutRequestRow[];
}) {
  const t = useTranslations("AdminPoints");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  if (requests.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noRequests")}</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {requests.map((r) => {
          const open = r.status === "REQUESTED" || r.status === "APPROVED";
          return (
            <li key={r.id} className="space-y-2 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {t(`payout_${r.status}`)}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {r.createdAt}
                    {r.note ? ` — ${r.note}` : null}
                  </p>
                </div>
                <span className="font-semibold" dir="ltr">
                  ${r.amountUsd.toFixed(2)}
                </span>
              </div>
              {open ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={refs[r.id] ?? ""}
                    onChange={(e) =>
                      setRefs((s) => ({ ...s, [r.id]: e.target.value }))
                    }
                    placeholder={t("payRefPlaceholder")}
                    className="w-48"
                  />
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      act(() => markPointPayoutPaid(r.id, refs[r.id] ?? ""))
                    }
                  >
                    {t("markPaid")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      act(() => rejectPointPayout(r.id, refs[r.id] ?? ""))
                    }
                  >
                    {t("reject")}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
