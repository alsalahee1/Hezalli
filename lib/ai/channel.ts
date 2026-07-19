// Shared glue between the messaging-channel webhooks (Telegram, later WhatsApp)
// and the Gemini assistant. Owns per-chat memory, cost/abuse guards, usage
// accounting, and self-healing retry, then formats a reply (text + product
// links) for a plain-text chat surface.
import "server-only";

import { prisma } from "@/lib/prisma";

import {
  runAssistant,
  type AssistantReply,
  type AudioInput,
  type ChatMessage,
} from "./assistant";
import {
  checkGlobalCaps,
  checkRate,
  recordDailyUsage,
  type GuardReason,
} from "./guards";

// Keep the last N turns (≈5 exchanges). Enough context for follow-ups without
// letting the prompt grow unbounded.
const MAX_HISTORY = 10;

export type ChannelResult = {
  reply: AssistantReply;
  /** Set when a cost/abuse guard short-circuited the turn (no Gemini call). */
  capped?: GuardReason;
};

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

function cappedMessage(reason: GuardReason, locale: string): string {
  const ar = locale === "ar";
  switch (reason) {
    case "rate":
      return ar
        ? "لقد أرسلت رسائل كثيرة خلال وقت قصير 😊 سيتابع معك فريقنا قريبًا."
        : "You've sent a lot of messages in a short time 😊 Our team will follow up with you shortly.";
    case "daily":
      return ar
        ? "لدينا ضغط كبير الآن — سيعود إليك فريقنا قريبًا. شكرًا لصبرك! 🙏"
        : "We're seeing very high demand right now — our team will get back to you shortly. Thanks for your patience! 🙏";
    case "spend":
      return ar
        ? "المساعد يأخذ استراحة قصيرة 🙏 وسيتابع معك فريقنا قريبًا."
        : "The assistant is taking a short break 🙏 — our team will follow up with you very soon.";
  }
}

function emptyReply(text: string): AssistantReply {
  return { text, cards: [], usage: { in: 0, out: 0 } };
}

/**
 * Run one assistant turn for a chat identified by (platform, chatId): enforce
 * cost/abuse guards, load and persist recent history, transcribe an optional
 * voice note, and self-heal a poisoned history by retrying once from scratch.
 * The conversation is anonymous (no Hezalli account), so order lookups aren't
 * available on these channels.
 */
export async function runChannelTurn(opts: {
  platform: string;
  chatId: string;
  userText: string;
  locale: string;
  audio?: AudioInput;
  now?: number;
}): Promise<ChannelResult> {
  const { platform, chatId, userText, locale, audio } = opts;
  const now = opts.now ?? Date.now();
  const where = { platform_chatId: { platform, chatId } };

  const existing = await prisma.botConversation.findUnique({
    where,
    select: { messages: true, rateHits: true },
  });

  // ── Guard 1: per-user hourly rate limit ──
  const rate = checkRate(existing?.rateHits, now);
  if (!rate.ok) {
    // Still record the attempt against the window so the limit actually holds.
    await prisma.botConversation.upsert({
      where,
      create: { platform, chatId, rateHits: rate.hits },
      update: { rateHits: rate.hits },
    });
    return { reply: emptyReply(cappedMessage("rate", locale)), capped: "rate" };
  }

  // ── Guards 2 & 3: global daily cap + monthly spend cap ──
  const global = await checkGlobalCaps(now);
  if (!global.ok) {
    return {
      reply: emptyReply(cappedMessage(global.reason, locale)),
      capped: global.reason,
    };
  }

  // A voice note with no caption still needs a text turn for history/context.
  const displayText = userText || (audio ? "[voice message]" : "");
  const prior = priorMessages(existing?.messages);

  // Self-healing: if Gemini rejects a poisoned/oversized history, wipe this
  // chat's memory and retry once from a clean slate.
  let reply: AssistantReply | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const base = pass === 0 ? prior : [];
    const history: ChatMessage[] = [
      ...base,
      { role: "user", text: displayText },
    ];
    try {
      reply = await runAssistant(history, { locale, userId: null }, { audio });
      break;
    } catch (err) {
      console.error(`[channel] attempt ${pass} failed:`, err);
      if (pass === 0) {
        await prisma.botConversation
          .upsert({
            where,
            create: { platform, chatId, messages: [] },
            update: { messages: [] },
          })
          .catch(() => {});
      }
    }
  }

  if (!reply) {
    return {
      reply: emptyReply(
        locale === "ar"
          ? "عذرًا، حدث خطأ بسيط. حاول مرة أخرى بعد قليل."
          : "Sorry, I had a small hiccup. Please try again in a moment.",
      ),
    };
  }

  // Persist trimmed history (voice replaced by a placeholder), bump counters,
  // slide the rate window, and record global usage for the spend estimate.
  const updated = [
    ...prior,
    { role: "user", text: displayText },
    { role: "assistant", text: reply.text },
  ].slice(-MAX_HISTORY) as ChatMessage[];

  await prisma.botConversation.upsert({
    where,
    create: {
      platform,
      chatId,
      messages: updated,
      rateHits: rate.hits,
      msgCount: 1,
      tokensIn: reply.usage.in,
      tokensOut: reply.usage.out,
    },
    update: {
      messages: updated,
      rateHits: rate.hits,
      msgCount: { increment: 1 },
      tokensIn: { increment: reply.usage.in },
      tokensOut: { increment: reply.usage.out },
    },
  });
  await recordDailyUsage(reply.usage, now).catch(() => {});

  return { reply };
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
