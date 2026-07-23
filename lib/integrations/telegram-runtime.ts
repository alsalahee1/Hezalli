// Single source of truth for handling one incoming Telegram update: resolve
// language, transcribe an optional voice note, run the guarded assistant turn,
// and reply. The webhook calls this out-of-band (after ACKing Telegram) so a
// slow LLM turn never triggers a redelivery.
import "server-only";

import { startLink, unlinkChat } from "@/lib/ai/account-link";
import { formatReplyText, runChannelTurn } from "@/lib/ai/channel";
import { renderVoice, wantsVoice } from "@/lib/ai/voice-reply";
import { routing } from "@/i18n/routing";

import {
  downloadTelegramFile,
  sendTelegramMessage,
  sendTelegramTyping,
  sendTelegramVoice,
} from "./telegram";

const PLATFORM = "telegram";

type TelegramFile = { file_id: string; mime_type?: string };
type TelegramMessage = {
  chat?: { id?: number };
  text?: string;
  caption?: string;
  voice?: TelegramFile;
  audio?: TelegramFile;
  from?: { language_code?: string };
};
export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

function resolveLocale(code?: string): "ar" | "en" {
  if (code?.startsWith("ar")) return "ar";
  if (code?.startsWith("en")) return "en";
  return routing.defaultLocale;
}

function startText(locale: string): string {
  return locale === "ar"
    ? "مرحبًا! أنا شادي، مساعد هزلي 🛍️\nاكتب ما تبحث عنه أو أرسل رسالة صوتية وسأساعدك في العثور على المنتجات ومقارنة الأسعار."
    : "Hi! I'm Shadi, the Hezalli assistant 🛍️\nType what you're looking for (or send a voice note) and I'll help you find products and compare prices.";
}

function errorText(locale: string): string {
  return locale === "ar"
    ? "عذرًا، حدث خطأ ما. حاول مرة أخرى بعد قليل."
    : "Sorry, something went wrong. Please try again shortly.";
}

function linkText(locale: string, url: string): string {
  return locale === "ar"
    ? `لربط حسابك في هزلي (لأسأل عن طلباتك)، افتح هذا الرابط وأنت مسجّل الدخول:\n${url}\nالرابط صالح لمدة 10 دقائق.`
    : `To connect your Hezalli account (so I can check your orders), open this link while signed in:\n${url}\nThis link is valid for 10 minutes.`;
}

function unlinkText(locale: string): string {
  return locale === "ar"
    ? "تم إلغاء ربط حسابك. لن أتمكن من رؤية طلباتك بعد الآن."
    : "Your account has been unlinked. I can no longer see your orders.";
}

export async function processTelegramUpdate(
  update: TelegramUpdate,
): Promise<void> {
  const msg = update.message ?? update.edited_message;
  const chatId = msg?.chat?.id;
  if (!chatId) return;

  const text = (msg?.text ?? msg?.caption ?? "").trim();
  const voiceFile = msg?.voice ?? msg?.audio;
  const locale = resolveLocale(msg?.from?.language_code);

  try {
    if (!text && !voiceFile) {
      await sendTelegramMessage(chatId, startText(locale));
      return;
    }
    if (text === "/start") {
      await sendTelegramMessage(chatId, startText(locale));
      return;
    }

    // Account-linking commands.
    if (text === "/link") {
      const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
      const code = await startLink(PLATFORM, String(chatId));
      const url = `${base}/${locale}/account/link-telegram?code=${code}`;
      await sendTelegramMessage(chatId, linkText(locale, url));
      return;
    }
    if (text === "/unlink") {
      await unlinkChat(PLATFORM, String(chatId));
      await sendTelegramMessage(chatId, unlinkText(locale));
      return;
    }

    await sendTelegramTyping(chatId);
    const audio = voiceFile
      ? await downloadTelegramFile(voiceFile.file_id, voiceFile.mime_type)
      : null;

    const { reply, capped } = await runChannelTurn({
      platform: PLATFORM,
      chatId: String(chatId),
      userText: text.slice(0, 2000),
      locale,
      audio: audio ?? undefined,
    });

    // Speak the reply when policy says so; text always carries product links.
    let sentVoice = false;
    if (
      wantsVoice({ isVoiceIn: Boolean(voiceFile), capped: Boolean(capped) })
    ) {
      const ogg = await renderVoice(reply.text, locale);
      if (ogg) sentVoice = await sendTelegramVoice(chatId, ogg);
    }
    const voiceOnly = process.env.BOT_REPLY_MODE?.toLowerCase() === "voice";
    const sendText = !voiceOnly || !sentVoice || reply.cards.length > 0;
    if (sendText) {
      await sendTelegramMessage(chatId, formatReplyText(reply, locale));
    }
  } catch (err) {
    console.error("[telegram] handler failed:", err);
    try {
      await sendTelegramMessage(chatId, errorText(locale));
    } catch {
      // Give up silently.
    }
  }
}
