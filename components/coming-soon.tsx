"use client";

import { Hammer } from "lucide-react";
import { useTranslations } from "next-intl";

export function ComingSoon({
  title,
  ns,
  titleKey,
}: {
  title?: string;
  ns?: string;
  titleKey?: string;
}) {
  const t = useTranslations();
  const c = useTranslations("Common");
  const heading =
    title ?? (ns && titleKey ? t(`${ns}.${titleKey}`) : c("comingSoon"));

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Hammer className="size-6 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="max-w-md text-muted-foreground">{c("comingSoonDesc")}</p>
    </div>
  );
}
