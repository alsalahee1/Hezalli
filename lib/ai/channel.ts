// Shared glue between the messaging-channel webhooks (Telegram, later WhatsApp)
// and the Gemini assistant. Handles short-lived per-chat memory so follow-up
// questions keep context, and formats a reply (text + product links) suitable
// for a plain-text chat surface.
import "server-only";

import { prisma } from "@/lib/prisma";

import {
  runAssistant,
  type AssistantReply,
  type ChatMessage,
} from "./assistant";

// Keep the last N turns (≈5 exchanges). Enough context for follow-ups without
// letting the prompt grow unbounded.
const MAX_HISTORY = 10;

function priorMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is ChatMessage =>
      !!m &&
      typeof m === "object" &&
      (m as ChatMessage).role !== undefined &&
      typeof (m as ChatMessage).text === "string",
  );
}

/**
 * Run one assistant turn for a chat identified by (platform, chatId), loading
 * and persisting recent history around it. The conversation is anonymous
 * (no Hezalli account), so order lookups aren't available on these channels.
 */
export async function runChannelTurn(opts: {
  platform: string;
  chatId: string;
  userText: string;
  locale: string;
}): Promise<AssistantReply> {
  const { platform, chatId, userText, locale } = opts;

  const existing = await prisma.botConversation.findUnique({
    where: { platform_chatId: { platform, chatId } },
    select: { messages: true },
  });

  const history: ChatMessage[] = [
    ...priorMessages(existing?.messages),
    { role: "user", text: userText },
  ];

  const reply = await runAssistant(history, { locale, userId: null });

  const updated = [...history, { role: "assistant", text: reply.text }].slice(
    -MAX_HISTORY,
  );

  await prisma.botConversation.upsert({
    where: { platform_chatId: { platform, chatId } },
    create: { platform, chatId, messages: updated },
    update: { messages: updated },
  });

  return reply;
}

/** Render an assistant reply as plain text with product links for a chat app. */
export function formatReplyText(reply: AssistantReply, locale: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
  let out = reply.text.trim();

  if (reply.cards.length && base) {
    const lines = reply.cards.map((c) => {
      const url = `${base}/${locale}/product/${c.slug}`;
      return `• ${c.title} — ${c.priceLabel}\n${url}`;
    });
    out += `\n\n${lines.join("\n\n")}`;
  }
  return out;
}
