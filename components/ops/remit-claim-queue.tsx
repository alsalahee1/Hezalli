"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { approveRemitClaim, rejectRemitClaim } from "@/lib/actions/remit-claim";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type RemitClaimRow = {
  id: string;
  who: string; // driver / point display name
  kind: "courier" | "point";
  amountUsd: number;
  method: string;
  reference: string;
  createdAt: string; // pre-formatted server-side
};

// Staff queue for digital COD remittance claims (docs §38): approve once the
// rail transfer is verified (writes the ledger row server-side), or reject
// with a reason that reaches the claimant.
export function RemitClaimQueue({ claims }: { claims: RemitClaimRow[] }) {
  const t = useTranslations("DeliveryManager");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  if (claims.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("remitEmpty")}</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {claims.map((c) => (
          <li key={c.id} className="space-y-2 px-3 py-2.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {c.who}{" "}
                  <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
                    {t(`remitKind_${c.kind}`)}
                  </span>
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {c.createdAt} — {c.method} ·{" "}
                  <span dir="ltr">{c.reference}</span>
                </p>
              </div>
              <span className="font-semibold" dir="ltr">
                ${c.amountUsd.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => act(() => approveRemitClaim(c.id))}
              >
                {t("remitApprove")}
              </Button>
              <Input
                value={reasons[c.id] ?? ""}
                onChange={(e) =>
                  setReasons((s) => ({ ...s, [c.id]: e.target.value }))
                }
                placeholder={t("remitReasonPlaceholder")}
                className="h-9 w-48"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  act(() => rejectRemitClaim(c.id, reasons[c.id] ?? ""))
                }
              >
                {t("remitReject")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {err ? (
        <p className="text-destructive text-xs">{t(`err_remit_${err}`)}</p>
      ) : null}
    </div>
  );
}
