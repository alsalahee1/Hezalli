"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  saveAnnouncement,
  type Announcement,
} from "@/lib/actions/announcement";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AnnouncementEditor({ current }: { current: Announcement }) {
  const t = useTranslations("AdminSettings");
  const router = useRouter();
  const [text, setText] = useState(current.text);
  const [active, setActive] = useState(current.active);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold">{t("announcementTitle")}</h2>
        <p className="text-muted-foreground text-sm">{t("announcementDesc")}</p>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={200}
        placeholder={t("announcementPlaceholder")}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        {t("announcementActive")}
      </label>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setSaved(false);
              await saveAnnouncement({ text, active });
              setSaved(true);
              router.refresh();
            })
          }
        >
          {pending ? t("saving") : t("save")}
        </Button>
        {saved && !pending ? (
          <span className="text-sm text-emerald-600">{t("saved")}</span>
        ) : null}
      </div>
    </div>
  );
}
