"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { saveAssistantKey } from "@/lib/actions/settings";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Admin manager for Shadi's Gemini API key. The stored key is never echoed
 * back to the browser — the server only tells us WHERE the active key comes
 * from (saved in the database, the env var fallback, or nowhere).
 */
export function AiKeyForm({ keySource }: { keySource: "db" | "env" | "none" }) {
  const t = useTranslations("AdminSettings");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = (apiKey: string | null) =>
    start(async () => {
      setErr(null);
      setDone(false);
      const res = await saveAssistantKey(apiKey);
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        setKey("");
        router.refresh();
      }
    });

  const status =
    keySource === "db"
      ? { text: t("aiKeyStatusDb"), tone: "text-emerald-600" }
      : keySource === "env"
        ? { text: t("aiKeyStatusEnv"), tone: "text-muted-foreground" }
        : { text: t("aiKeyStatusNone"), tone: "text-amber-600" };

  return (
    <section className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="flex items-center gap-2 font-medium">
          <Sparkles className="text-primary size-4" />
          {t("aiTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("aiDesc")}</p>
      </div>

      <p className={`text-sm ${status.tone}`}>{status.text}</p>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("aiKey")}</span>
        <Input
          type="password"
          dir="ltr"
          autoComplete="off"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setDone(false);
          }}
          placeholder="AIza…"
        />
        <span className="text-muted-foreground block text-xs">
          {t("aiKeyHint")}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => run(key)} disabled={pending || !key.trim()}>
          {pending ? t("saving") : t("aiKeySave")}
        </Button>
        {keySource === "db" ? (
          <Button
            variant="outline"
            onClick={() => run(null)}
            disabled={pending}
          >
            {t("aiKeyRemove")}
          </Button>
        ) : null}
        {done ? (
          <span className="text-sm text-emerald-600">{t("saved")}</span>
        ) : null}
        {err ? (
          <span className="text-destructive text-sm">{t(`err_${err}`)}</span>
        ) : null}
      </div>
    </section>
  );
}
