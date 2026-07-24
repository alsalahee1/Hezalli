"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

import { setMerchantStatus } from "@/lib/actions/merchant-application";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

// Suspend/activate a live merchant. Suspending pauses their app and blocks new
// payments, so it goes through the same confirm-before-submit pattern as other
// destructive toggles.
export function MerchantStatusToggle({
  merchantId,
  status,
}: {
  merchantId: string;
  status: "ACTIVE" | "SUSPENDED";
}) {
  const t = useTranslations("AdminMerchants");
  const tc = useTranslations("Common");
  const { confirm, dialog } = useConfirm();
  const confirmedRef = useRef(false);
  const suspending = status === "ACTIVE";

  return (
    <>
      {dialog}
      <form
        action={setMerchantStatus}
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
        <input type="hidden" name="merchantId" value={merchantId} />
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
