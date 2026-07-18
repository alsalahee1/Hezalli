import { getTranslations } from "next-intl/server";

import { getAnnouncement } from "@/lib/actions/announcement";
import { AnnouncementEditor } from "@/components/admin/announcement-editor";

export default async function AdminSettingsPage() {
  const t = await getTranslations("AdminSettings");
  const announcement = await getAnnouncement();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <AnnouncementEditor current={announcement} />
    </div>
  );
}
