"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

import { setPointStatus } from "@/lib/actions/point-application";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

// Suspend/activate a live delivery point. Suspending pauses a partner hub
// that may be holding parcels, so it goes through the same confirm-before-
// submit pattern as other destructive toggles (see address-book.tsx).
export function PointStatusToggle({
  pointId,
  status,
}: {
  pointId: string;
  status: "ACTIVE" | "SUSPENDED";
}) {
  const t = useTranslations("AdminPoints");
  const tc = useTranslations("Common");
  const { confirm, dialog } = useConfirm();
  const confirmedRef = useRef(false);
  const suspending = status === "ACTIVE";

  return (
    <>
      {dialog}
      <form
        action={setPointStatus}
        onSubmit={(e) => {
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return;
          }
          if (!suspending) return;
          e.preventDefault();
          const form = e.currentTarget;
          void confirm(tc("cannotUndo"), {
            title: t("suspendConfirm"),
            confirmLabel: t("suspend"),
            destructive: true,
          }).then((ok) => {
            if (!ok) return;
            confirmedRef.current = true;
            form.requestSubmit();
          });
        }}
      >
        <input type="hidden" name="pointId" value={pointId} />
        <input
          type="hidden"
          name="status"
          value={suspending ? "SUSPENDED" : "ACTIVE"}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className={cn(suspending && "text-destructive")}
        >
          {suspending ? t("suspend") : t("activate")}
        </Button>
      </form>
    </>
  );
}
