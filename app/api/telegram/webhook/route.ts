import { NextResponse, type NextRequest } from "next/server";

import { formatReplyText, runChannelTurn } from "@/lib/ai/channel";
import { geminiConfigured } from "@/lib/ai/gemini";
import {
  sendTelegramMessage,
  sendTelegramTyping,
  telegramConfigured,
} from "@/lib/integrations/telegram";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type TelegramMessage = {
  chat?: { id?: number };
  text?: string;
  from?: { language_code?: string };
};
type TelegramUpdate = {
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
    ? "مرحبًا بك في مساعد هزلي! 🛍️\nاكتب ما تبحث عنه وسأساعدك في العثور على المنتجات ومقارنة الأسعار."
    : "Welcome to the Hezalli assistant! 🛍️\nTell me what you're looking for and I'll help you find products and compare prices.";
}

function errorText(locale: string): string {
  return locale === "ar"
    ? "عذرًا، حدث خطأ ما. حاول مرة أخرى بعد قليل."
    : "Sorry, something went wrong. Please try again shortly.";
}

export async function POST(req: NextRequest) {
  // Ack quietly when the bot isn't fully configured so Telegram stops retrying.
  if (!telegramConfigured() || !geminiConfigured()) {
    return NextResponse.json({ ok: true });
  }

  // Telegram echoes the secret we set via setWebhook; reject anything else.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const text = (message?.text ?? "").trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });

  const locale = resolveLocale(message?.from?.language_code);

  try {
    if (text === "/start") {
      await sendTelegramMessage(chatId, startText(locale));
      return NextResponse.json({ ok: true });
    }

    await sendTelegramTyping(chatId);
    const reply = await runChannelTurn({
      platform: "telegram",
      chatId: String(chatId),
      userText: text.slice(0, 2000),
      locale,
    });
    await sendTelegramMessage(chatId, formatReplyText(reply, locale));
  } catch (err) {
    console.error("[telegram] handler failed:", err);
    try {
      await sendTelegramMessage(chatId, errorText(locale));
    } catch {
      // Give up silently — we still ack the update below.
    }
  }

  // Always 200 so Telegram considers the update delivered (we've already
  // replied or logged the failure).
  return NextResponse.json({ ok: true });
}
