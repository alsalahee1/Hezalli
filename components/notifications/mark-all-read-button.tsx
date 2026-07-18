"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { markAllNotificationsRead } from "@/lib/actions/notification";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function MarkAllReadButton() {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markAllNotificationsRead();
          router.refresh();
        })
      }
    >
      <CheckCheck className="size-4" /> {t("markAllRead")}
    </Button>
  );
}
