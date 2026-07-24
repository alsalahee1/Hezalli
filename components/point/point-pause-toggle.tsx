"use client";

import { useState, useTransition } from "react";
import { CirclePause, CirclePlay } from "lucide-react";
import { useTranslations } from "next-intl";

import { setPointPaused } from "@/lib/actions/point";
import { useRouter } from "@/i18n/navigation";

// Hub vacation-mode switch (mirrors the driver's PauseToggle): loud amber
// while paused, quiet one-liner while open.
export function PointPauseToggle({ paused }: { paused: boolean }) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);

  const toggle = () =>
    start(async () => {
      setErr(false);
      const res = await setPointPaused(!paused);
      if (res.error) setErr(true);
      else router.refresh();
    });

  return (
    <div
      className={
        paused
          ? "rounded-xl border border-amber-500/50 bg-amber-500/10 p-4"
          : "rounded-xl border p-4"
      }
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={
              paused
                ? "flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-500"
                : "text-sm font-medium"
            }
          >
            {paused ? (
              <>
                <CirclePause className="size-4" /> {t("hubPausedTitle")}
              </>
            ) : (
              t("hubPauseTitle")
            )}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {paused ? t("hubPausedBody") : t("hubPauseBody")}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={
            paused
              ? "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              : "text-muted-foreground hover:text-foreground inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-50"
          }
        >
          {paused ? (
            <>
              <CirclePlay className="size-4" /> {t("hubResumeBtn")}
            </>
          ) : (
            <>
              <CirclePause className="size-4" /> {t("hubPauseBtn")}
            </>
          )}
        </button>
      </div>
      {err ? (
        <p className="text-destructive mt-1.5 text-xs">{t("pauseError")}</p>
      ) : null}
    </div>
  );
}
