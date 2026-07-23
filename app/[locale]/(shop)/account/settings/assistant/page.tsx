import { getLocale, getTranslations } from "next-intl/server";

import { getActiveBot, getBotAvatar } from "@/lib/ai/active-bot";
import { BOT_IDS, botName } from "@/lib/ai/bot-constants";
import { assistantReady } from "@/lib/ai/gemini";
import { BotSwitcher } from "@/components/ai/bot-switcher";

export const dynamic = "force-dynamic";

// Lets a shopper pick which assistant character (Shadi / Jumana) they chat
// with. Open to everyone — the choice is a cookie, no login required.
export default async function AssistantPrefsPage() {
  const t = await getTranslations("BotSwitcher");
  const locale = await getLocale();

  if (!(await assistantReady())) {
    return (
      <div className="max-w-2xl space-y-2">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("unavailable")}</p>
      </div>
    );
  }

  const active = await getActiveBot();
  const bots = await Promise.all(
    BOT_IDS.map(async (id) => ({
      id,
      name: botName(id, locale),
      avatar: await getBotAvatar(id),
    })),
  );

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <BotSwitcher bots={bots} active={active} />
    </div>
  );
}
