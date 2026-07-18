"use client";

import { useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { getOrCreateConversation } from "@/lib/actions/chat";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function ChatLauncher({
  storeId,
  subOrderId,
  label,
  variant = "ghost",
  size = "sm",
}: {
  storeId: string;
  subOrderId?: string;
  label?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default";
}) {
  const t = useTranslations("Chat");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await getOrCreateConversation(storeId, subOrderId);
          if (res.conversationId) {
            router.push(`/account/chat?c=${res.conversationId}`);
          } else if (res.error === "unauthorized") {
            router.push("/login?callbackUrl=/account/chat");
          }
        })
      }
    >
      <MessageCircle className="size-4" />
      {label ?? t("chat")}
    </Button>
  );
}
