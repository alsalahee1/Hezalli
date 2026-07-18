import { getTranslations } from "next-intl/server";

import { getAnnouncement } from "@/lib/actions/announcement";
import { getPlatformSettings } from "@/lib/settings";
import { AnnouncementEditor } from "@/components/admin/announcement-editor";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const t = await getTranslations("AdminSettings");
  const [announcement, settings] = await Promise.all([
    getAnnouncement(),
    getPlatformSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <PlatformSettingsForm current={settings} />
      <AnnouncementEditor current={announcement} />
    </div>
  );
}
