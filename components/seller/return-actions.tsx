"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  approveReturn,
  confirmReturnReceived,
  escalateReturn,
  rejectReturn,
} from "@/lib/actions/return";
import { type ReturnType } from "@/lib/returns";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReturnActions({
  returnId,
  status,
  type,
  hasDispute,
}: {
  returnId: string;
  status: string;
  type: ReturnType;
  hasDispute: boolean;
}) {
  const t = useTranslations("SellerReturns");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else {
        setPanel(null);
        setNote("");
        router.refresh();
      }
    });

  const canConfirm =
    (status === "APPROVED" && type === "refund_only") ||
    status === "IN_TRANSIT";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "REQUESTED" ? (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                setPanel((p) => (p === "approve" ? null : "approve"))
              }
            >
              {t("approve")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={pending}
              onClick={() =>
                setPanel((p) => (p === "reject" ? null : "reject"))
              }
            >
              {t("reject")}
            </Button>
          </>
        ) : null}

        {canConfirm ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => confirmReturnReceived(returnId, restock))}
          >
            {t("confirmReceived")}
          </Button>
        ) : null}

        {!hasDispute && status !== "REFUNDED" && status !== "CLOSED" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => escalateReturn(returnId))}
          >
            {t("escalate")}
          </Button>
        ) : null}
      </div>

      {canConfirm ? (
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="size-3.5"
            checked={restock}
            onChange={(e) => setRestock(e.target.checked)}
          />
          {t("restock")}
        </label>
      ) : null}

      {panel === "approve" ? (
        <div className="flex flex-wrap items-end gap-2">
          {type === "return_and_refund" ? (
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("returnAddressPlaceholder")}
              className="w-64"
            />
          ) : null}
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => approveReturn(returnId, note))}
          >
            {t("confirmApprove")}
          </Button>
        </div>
      ) : null}

      {panel === "reject" ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("rejectReasonPlaceholder")}
            className="w-64"
          />
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={pending}
            onClick={() => run(() => rejectReturn(returnId, note))}
          >
            {t("confirmReject")}
          </Button>
        </div>
      ) : null}

      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
    </div>
  );
}
