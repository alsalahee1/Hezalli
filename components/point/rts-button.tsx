"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { pointReturnToSeller } from "@/lib/actions/point";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

// Terminal return-to-seller for a parcel whose attempts are exhausted.
// Confirm-gated: this ends the delivery for good.
export function RtsButton({ tracking }: { tracking: string }) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const run = async () => {
    if (
      !(await confirm(t("rtsConfirm"), {
        title: t("rts"),
        destructive: true,
      }))
    )
      return;
    start(async () => {
      setErr(null);
      const res = await pointReturnToSeller(tracking);
      if (res.error) setErr(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      {dialog}
      <Button size="sm" variant="destructive" onClick={run} disabled={pending}>
        <Undo2 className="size-4" /> {pending ? t("saving") : t("rts")}
      </Button>
      {err ? (
        <span className="text-destructive text-xs">{t(`err_${err}`)}</span>
      ) : null}
    </div>
  );
}
