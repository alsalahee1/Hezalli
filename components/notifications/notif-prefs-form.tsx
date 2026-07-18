"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { saveNotificationPrefs } from "@/lib/actions/notification";
import { NOTIF_CATEGORIES, type NotifPrefs } from "@/lib/notif-prefs";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function NotifPrefsForm({ initial }: { initial: NotifPrefs }) {
  const t = useTranslations("NotifPrefs");
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotifPrefs>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const toggle = (c: (typeof NOTIF_CATEGORIES)[number]) =>
    setPrefs((p) => ({ ...p, [c]: !p[c] }));

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {NOTIF_CATEGORIES.map((c) => (
          <li key={c} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">{t(`cat_${c}`)}</p>
              <p className="text-muted-foreground text-xs">{t(`desc_${c}`)}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[c]}
              onClick={() => toggle(c)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                prefs[c] ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
                  prefs[c] ? "start-[22px]" : "start-0.5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setSaved(false);
              await saveNotificationPrefs(prefs);
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
