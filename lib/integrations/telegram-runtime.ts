// Single source of truth for handling one incoming Telegram update: resolve
// language, transcribe an optional voice note, run the guarded assistant turn,
// and reply. The webhook calls this out-of-band (after ACKing Telegram) so a
// slow LLM turn never triggers a redelivery.
import "server-only";

import { formatReplyText, runChannelTurn } from "@/lib/ai/channel";
import { recordTtsUsage } from "@/lib/ai/guards";
import { synthesizeVoice } from "@/lib/ai/tts";
import { routing } from "@/i18n/routing";

import {
  downloadTelegramFile,
  sendTelegramMessage,
  sendTelegramTyping,
  sendTelegramVoice,
} from "./telegram";

type ReplyMode = "text" | "voice" | "both" | "match";

function replyMode(): ReplyMode {
  const m = (process.env.BOT_REPLY_MODE || "text").toLowerCase();
  return m === "voice" || m === "both" || m === "match" ? m : "text";
}

function ttsStyle(locale: string): string {
  if (process.env.BOT_TTS_STYLE) return process.env.BOT_TTS_STYLE;
  return locale === "ar"
    ? "قل هذا بأسلوب ودّي وطبيعي كأنك مساعد متجر لطيف:"
    : "Say this warmly and naturally, like a friendly shop assistant:";
}

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

    const { reply, capped } = await runChannelTurn({
      platform: "telegram",
      chatId: String(chatId),
      userText: text.slice(0, 2000),
      locale,
      audio: audio ?? undefined,
    });

    // Decide voice vs text. Never synthesize on a capped turn (that would spend
    // more against the very cap we just hit). In 'match' mode we mirror the
    // customer: a voice note gets a voice reply.
    const mode = replyMode();
    const wantVoice =
      !capped &&
      (mode === "voice" ||
        mode === "both" ||
        (mode === "match" && Boolean(voiceFile)));

    let sentVoice = false;
    if (wantVoice) {
      const tts = await synthesizeVoice(reply.text, {
        voice: process.env.BOT_TTS_VOICE,
        style: ttsStyle(locale),
      });
      if (tts) {
        sentVoice = await sendTelegramVoice(chatId, tts.ogg);
        if (sentVoice)
          void recordTtsUsage(tts.tokens, Date.now()).catch(() => {});
      }
    }

    // Send text unless this was a pure, successful voice reply with no product
    // links to surface. Links must always be tappable, so text goes out whenever
    // there are cards, or when voice didn't send (fallback).
    const sendText = mode !== "voice" || !sentVoice || reply.cards.length > 0;
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
