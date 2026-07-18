import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { notificationHref } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";

export default async function NotificationsPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/account/notifications`);
  }
  const t = await getTranslations("Notifications");
  const tp = await getTranslations("NotifPrefs");
  const format = await getFormatter();

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/account/settings/notifications"
            className="text-primary text-sm hover:underline"
          >
            {tp("link")}
          </Link>
          {unread > 0 ? <MarkAllReadButton /> : null}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={notificationHref("buyer", n.data)}
                className={cn(
                  "hover:bg-muted flex flex-col gap-0.5 px-4 py-3",
                  !n.readAt && "bg-primary/5",
                )}
              >
                <span className="flex items-center gap-2">
                  {!n.readAt ? (
                    <span className="bg-primary size-1.5 shrink-0 rounded-full" />
                  ) : null}
                  <span className="font-medium">{n.title}</span>
                </span>
                {n.body ? (
                  <span className="text-muted-foreground text-sm">
                    {n.body}
                  </span>
                ) : null}
                <span className="text-muted-foreground text-xs">
                  {format.dateTime(n.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
