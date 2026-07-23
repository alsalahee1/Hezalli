import { getTranslations } from "next-intl/server";

import { getDailyCap, getSpendCapUsd, monthSpendUsd } from "@/lib/ai/guards";
import { dayKey, monthKey } from "@/lib/ai/guards-core";
import { telegramTokenSource } from "@/lib/integrations/telegram";
import { whatsappConfigured } from "@/lib/integrations/whatsapp";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings, SETTING_DEFAULTS } from "@/lib/settings";
import { AssistantSettings } from "@/components/admin/assistant-settings";

export const dynamic = "force-dynamic";

// Dedicated settings page for Shadi (شادي), the AI assistant — identity,
// credentials, channels, voice replies, cost guards, and live usage.
export default async function AdminAssistantPage() {
  const t = await getTranslations("AdminAssistant");
  const now = Date.now();

  const [
    settings,
    aiKeyRow,
    today,
    monthRows,
    spend,
    dailyCap,
    spendCap,
    tgSource,
    tgUsernameRow,
  ] = await Promise.all([
    getPlatformSettings(),
    prisma.platformSetting.findUnique({
      where: { key: "gemini_api_key" },
      select: { value: true },
    }),
    prisma.botDailyUsage.findUnique({
      where: { day: dayKey(now) },
      select: { messages: true },
    }),
    prisma.botDailyUsage.findMany({
      where: { day: { startsWith: monthKey(now) } },
      select: { messages: true },
    }),
    monthSpendUsd(now),
    getDailyCap(),
    getSpendCapUsd(),
    telegramTokenSource(),
    prisma.platformSetting.findUnique({
      where: { key: "telegram_bot_username" },
      select: { value: true },
    }),
  ]);

  // Tell the client only WHERE the key comes from — never the key itself.
  const keySource =
    typeof aiKeyRow?.value === "string" && aiKeyRow.value.trim()
      ? ("db" as const)
      : process.env.GEMINI_API_KEY?.trim()
        ? ("env" as const)
        : ("none" as const);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <AssistantSettings
        current={{
          enabled: settings.ai_assistant_enabled,
          avatar: settings.ai_assistant_avatar,
          defaultAvatar: SETTING_DEFAULTS.ai_assistant_avatar,
          keySource,
          model: settings.ai_gemini_model,
          replyMode: settings.ai_reply_mode,
          ttsVoice: settings.ai_tts_voice,
          ttsStyle: settings.ai_tts_style,
          maxPerHour: settings.ai_max_per_hour,
          dailyCap: settings.ai_daily_cap,
          spendCapUsd: settings.ai_spend_cap_usd,
          telegramEnabled: settings.ai_channel_telegram,
          whatsappEnabled: settings.ai_channel_whatsapp,
          persona: settings.ai_persona,
          greeting: settings.ai_greeting,
          temperature: settings.ai_temperature,
          maxTokens: settings.ai_max_tokens,
          telegramSource: tgSource,
          telegramUsername:
            typeof tgUsernameRow?.value === "string" ? tgUsernameRow.value : "",
          whatsappConfigured: whatsappConfigured(),
        }}
        usage={{
          messagesToday: today?.messages ?? 0,
          effectiveDailyCap: dailyCap,
          monthSpendUsd: spend,
          effectiveSpendCap: spendCap,
          monthMessages: monthRows.reduce((s, r) => s + r.messages, 0),
        }}
      />
    </div>
  );
}
