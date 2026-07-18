"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

// Header chat entry with an unread badge. Polls the conversation feed.
export function ChatIcon({
  variant = "buyer",
}: {
  variant?: "buyer" | "seller";
}) {
  const t = useTranslations("Chat");
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations", { cache: "no-store" });
      if (res.ok) setUnread((await res.json()).unread ?? 0);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 45_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <Link
      href={variant === "seller" ? "/seller/chat" : "/account/chat"}
      aria-label={t("title")}
      className="hover:bg-muted relative inline-flex size-9 items-center justify-center rounded-md"
    >
      <MessageSquare className="size-5" />
      {unread > 0 ? (
        <span className="bg-primary text-primary-foreground absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
