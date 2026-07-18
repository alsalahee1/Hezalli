import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { resolvePrefs } from "@/lib/notif-prefs";
import { prisma } from "@/lib/prisma";
import { NotifPrefsForm } from "@/components/notifications/notif-prefs-form";

export default async function NotifPrefsPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(
      `/${locale}/login?callbackUrl=/${locale}/account/settings/notifications`,
    );
  }
  const t = await getTranslations("NotifPrefs");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationPrefs: true },
  });
  const prefs = resolvePrefs(user?.notificationPrefs);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <NotifPrefsForm initial={prefs} />
    </div>
  );
}
