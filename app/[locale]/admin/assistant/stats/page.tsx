import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";

import { getBotAvatar } from "@/lib/ai/active-bot";
import { BOT_IDS, botName } from "@/lib/ai/bot-constants";
import { getAssistantStats } from "@/lib/ai/stats";
import { Link } from "@/i18n/navigation";
import { AssistantStatsView } from "@/components/admin/assistant-stats";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

// Per-character analytics for Shadi & Jumana: message + user share, busiest
// pages, and most-asked questions over a selectable window.
export default async function AssistantStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const t = await getTranslations("AssistantStats");
  const locale = await getLocale();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;

  // Resilient to the table not existing yet (first deploy before the migration
  // applies): fall back to an empty dataset rather than erroring the page.
  const stats = await getAssistantStats(days, Date.now()).catch(() => ({
    days,
    totalMessages: 0,
    totalUsers: 0,
    perBot: [],
    daily: [],
  }));
  const bots = Object.fromEntries(
    await Promise.all(
      BOT_IDS.map(async (id) => [
        id,
        { name: botName(id, locale), avatar: await getBotAvatar(id) },
      ]),
    ),
  ) as Record<string, { name: string; avatar: string }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("desc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/admin/assistant/stats?days=${r}`}
                className={
                  r === days
                    ? "bg-primary text-primary-foreground rounded-md px-3 py-1.5 font-medium"
                    : "text-muted-foreground hover:bg-muted rounded-md px-3 py-1.5"
                }
              >
                {t("lastDays", { days: r })}
              </Link>
            ))}
          </div>
          {/* Plain anchor — hits the API route directly to download the file. */}
          <a
            href={`/api/admin/assistant/stats/export?days=${days}`}
            className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium"
          >
            <Download className="size-4" />
            {t("export")}
          </a>
        </div>
      </div>
      <AssistantStatsView stats={stats} bots={bots} />
    </div>
  );
}
