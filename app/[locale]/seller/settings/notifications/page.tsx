import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { resolvePrefs } from "@/lib/notif-prefs";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { NotifPrefsForm } from "@/components/notifications/notif-prefs-form";
import { PushToggle } from "@/components/notifications/push-toggle";

export default async function SellerNotificationsSettingsPage() {
  const gate = await requireSellerStore();
  if (!gate) return null; // layout redirects unauthenticated/non-seller users

  const t = await getTranslations("NotifPrefs");
  const s = await getTranslations("SellerShipping");
  const user = await prisma.user.findUnique({
    where: { id: gate.userId },
    select: { notificationPrefs: true },
  });
  const prefs = resolvePrefs(user?.notificationPrefs);

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/seller/settings"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {s("backToSettings")}
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <PushToggle />
      <NotifPrefsForm initial={prefs} />
    </div>
  );
}
