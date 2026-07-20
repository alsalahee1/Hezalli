"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { reconcileWalletBalance } from "@/lib/actions/wallet-reconcile";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function ReconcileButton({ userId }: { userId: string }) {
  const t = useTranslations("AdminWalletAudit");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await reconcileWalletBalance(userId);
          router.refresh();
        })
      }
    >
      {pending ? t("reconciling") : t("reconcile")}
    </Button>
  );
}
