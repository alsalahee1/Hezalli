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
      <div className="bg-muted flex size-14 items-center justify-center rounded-full">
        <Hammer className="text-muted-foreground size-6" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="text-muted-foreground max-w-md">{c("comingSoonDesc")}</p>
    </div>
  );
}
