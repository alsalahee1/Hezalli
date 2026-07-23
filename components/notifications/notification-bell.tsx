"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notification";
import { notificationHref, type NotifVariant } from "@/lib/notifications";
import { playNotifySound } from "@/lib/notify-sound";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Popover } from "@/components/ui/popover";

type Item = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell({
  variant = "buyer",
}: {
  variant?: NotifVariant;
}) {
  const t = useTranslations("Notifications");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevUnread = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };
      // Skip the initial mount so we don't ping for notifications that were
      // already unread before the page loaded.
      if (prevUnread.current !== null && data.unread > prevUnread.current) {
        playNotifySound();
      }
      prevUnread.current = data.unread;
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 45_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const openItem = (it: Item) => {
    setOpen(false);
    if (!it.readAt) {
      setUnread((n) => Math.max(0, n - 1));
      void markNotificationRead(it.id);
    }
    router.push(notificationHref(variant, it.data));
  };

  const markAll = async () => {
    setUnread(0);
    setItems((its) =>
      its.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })),
    );
    await markAllNotificationsRead();
  };

  const seeAllHref =
    variant === "buyer" || variant === "point"
      ? "/account/notifications"
      : undefined;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        aria-label={t("title")}
        className="hover:bg-muted relative inline-flex size-9 items-center justify-center rounded-md"
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="bg-primary text-primary-foreground absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      <Popover open={open} onClose={() => setOpen(false)}>
        {(shown) => (
          <div
            className={cn(
              "bg-background fixed inset-x-2 top-16 z-50 origin-top overflow-hidden rounded-lg border shadow-lg transition duration-200 ease-out will-change-transform motion-reduce:transition-none sm:absolute sm:inset-x-auto sm:end-0 sm:top-auto sm:mt-1 sm:w-80",
              shown
                ? "translate-y-0 scale-100 opacity-100"
                : "-translate-y-1 scale-95 opacity-0",
            )}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">{t("title")}</span>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={markAll}
                  className="text-primary text-xs hover:underline"
                >
                  {t("markAllRead")}
                </button>
              ) : null}
            </div>

            {items.length === 0 ? (
              <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                {t("empty")}
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => openItem(it)}
                      className={cn(
                        "hover:bg-muted flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-start last:border-0",
                        !it.readAt && "bg-primary/5",
                      )}
                    >
                      <span className="flex w-full items-center gap-2">
                        {!it.readAt ? (
                          <span className="bg-primary size-1.5 shrink-0 rounded-full" />
                        ) : null}
                        <span className="line-clamp-1 text-sm font-medium">
                          {it.title}
                        </span>
                      </span>
                      {it.body ? (
                        <span className="text-muted-foreground line-clamp-2 text-xs">
                          {it.body}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground text-[11px]">
                        {format.relativeTime(new Date(it.createdAt))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {seeAllHref ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(seeAllHref);
                }}
                className="text-primary w-full border-t px-3 py-2 text-center text-sm font-medium hover:underline"
              >
                {t("seeAll")}
              </button>
            ) : null}
          </div>
        )}
      </Popover>
    </div>
  );
}
