import { getTranslations } from "next-intl/server";

import { getAnnouncement } from "@/lib/actions/announcement";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { AiKeyForm } from "@/components/admin/ai-key-form";
import { AnnouncementEditor } from "@/components/admin/announcement-editor";
import {
  ExchangeRatesForm,
  type RateRow,
} from "@/components/admin/exchange-rates-form";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";

// Every rate an admin manages; YER varies by currency zone (DECISIONS.md §3).
const MANAGED_RATES: Array<Pick<RateRow, "currency" | "zone">> = [
  { currency: "YER", zone: "NORTH" },
  { currency: "YER", zone: "SOUTH" },
  { currency: "YER", zone: "DEFAULT" },
  { currency: "SAR", zone: "DEFAULT" },
  { currency: "AED", zone: "DEFAULT" },
];

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const t = await getTranslations("AdminSettings");
  const [announcement, settings, rateRows, aiKeyRow] = await Promise.all([
    getAnnouncement(),
    getPlatformSettings(),
    prisma.exchangeRate.findMany({
      select: { currency: true, zone: true, rate: true },
    }),
    prisma.platformSetting.findUnique({
      where: { key: "gemini_api_key" },
      select: { value: true },
    }),
  ]);
  // Tell the form only WHERE Shadi's key comes from — never the key itself.
  const keySource =
    typeof aiKeyRow?.value === "string" && aiKeyRow.value.trim()
      ? ("db" as const)
      : process.env.GEMINI_API_KEY?.trim()
        ? ("env" as const)
        : ("none" as const);
  const rates: RateRow[] = MANAGED_RATES.map((m) => ({
    ...m,
    rate: Number(
      rateRows.find((r) => r.currency === m.currency && r.zone === m.zone)
        ?.rate ?? 0,
    ),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <PlatformSettingsForm current={settings} />
      <AiKeyForm keySource={keySource} />
      <ExchangeRatesForm current={rates} />
      <AnnouncementEditor current={announcement} />
    </div>
  );
}
