"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Live countdown to an end time. Renders HH:MM:SS (with days when > 24h).
export function Countdown({ to, onDone }: { to: string; onDone?: () => void }) {
  const t = useTranslations("Flash");
  const [ms, setMs] = useState(() => new Date(to).getTime() - Date.now());

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
