// Single source of truth for handling one incoming Telegram update: resolve
// language, transcribe an optional voice note, run the guarded assistant turn,
// and reply. The webhook calls this out-of-band (after ACKing Telegram) so a
// slow LLM turn never triggers a redelivery.
import "server-only";

import { formatReplyText, runChannelTurn } from "@/lib/ai/channel";
import { routing } from "@/i18n/routing";

import {
  downloadTelegramFile,
  sendTelegramMessage,
  sendTelegramTyping,
} from "./telegram";

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
    ? "مرحبًا بك في مساعد هزلي! 🛍️\nاكتب ما تبحث عنه أو أرسل رسالة صوتية وسأساعدك في العثور على المنتجات ومقارنة الأسعار."
    : "Welcome to the Hezalli assistant! 🛍️\nType what you're looking for (or send a voice note) and I'll help you find products and compare prices.";
}

function errorText(locale: string): string {
  return locale === "ar"
    ? "عذرًا، حدث خطأ ما. حاول مرة أخرى بعد قليل."
    : "Sorry, something went wrong. Please try again shortly.";
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

    await sendTelegramTyping(chatId);
    const audio = voiceFile
      ? await downloadTelegramFile(voiceFile.file_id, voiceFile.mime_type)
      : null;

    const { reply } = await runChannelTurn({
      platform: "telegram",
      chatId: String(chatId),
      userText: text.slice(0, 2000),
      locale,
      audio: audio ?? undefined,
    });
    await sendTelegramMessage(chatId, formatReplyText(reply, locale));
  } catch (err) {
    console.error("[telegram] handler failed:", err);
    try {
      await sendTelegramMessage(chatId, errorText(locale));
    } catch {
      // Give up silently.
    }
  }
}
