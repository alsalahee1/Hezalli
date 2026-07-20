"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Live countdown to an end time. Renders HH:MM:SS (with days when > 24h).
export function Countdown({ to, onDone }: { to: string; onDone?: () => void }) {
  const t = useTranslations("Flash");
  // Start null so the server and the first client render agree (no time-based
  // text mismatch); the real value is computed after mount.
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const left = new Date(to).getTime() - Date.now();
      setMs(left);
      if (left <= 0) onDone?.();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [to, onDone]);

  if (ms === null) {
    // Stable placeholder rendered identically on server + first client paint.
    return (
      <span className="font-mono text-sm tabular-nums" dir="ltr">
        --:--:--
      </span>
    );
  }
  if (ms <= 0) return <span className="font-mono text-sm">{t("ended")}</span>;

  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");

  return (
    <span className="font-mono text-sm tabular-nums" dir="ltr">
      {days > 0 ? `${days}${t("dayShort")} ` : ""}
      {hh}:{mm}:{ss}
    </span>
  );
}
