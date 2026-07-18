import { getTranslations } from "next-intl/server";

import { getFlashSales } from "@/lib/flash";
import { FlashSection } from "@/components/promotions/flash-section";

export default async function FlashSalePage() {
  const t = await getTranslations("Flash");
  const [live, upcoming] = await Promise.all([
    getFlashSales("live"),
    getFlashSales("upcoming"),
  ]);

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {live.length === 0 && upcoming.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
          {t("none")}
        </div>
      ) : null}

      {live.length > 0 ? (
        <div className="space-y-5">
          <h2 className="font-semibold">{t("liveNow")}</h2>
          {live.map((s) => (
            <FlashSection key={s.id} sale={s} />
          ))}
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <div className="space-y-5">
          <h2 className="font-semibold">{t("upcoming")}</h2>
          {upcoming.map((s) => (
            <FlashSection key={s.id} sale={s} upcoming />
          ))}
        </div>
      ) : null}
    </main>
  );
}
