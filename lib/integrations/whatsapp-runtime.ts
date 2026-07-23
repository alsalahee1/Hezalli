// Handle one WhatsApp Cloud API webhook payload: for each inbound message,
// transcribe optional voice, run the shared guarded assistant turn, and reply
// (text and/or voice). Reuses the same channel + guards + voice policy as
// Telegram — only the transport differs.
import "server-only";

import { formatReplyText, runChannelTurn } from "@/lib/ai/channel";
import { renderVoice, replyMode, wantsVoice } from "@/lib/ai/voice-reply";
import { routing } from "@/i18n/routing";

import { seenEventId } from "./dedupe";
import {
  downloadWhatsAppMedia,
  sendWhatsAppText,
  sendWhatsAppVoice,
} from "./whatsapp";

const PLATFORM = "whatsapp";

// WhatsApp payloads don't carry a UI language, so pick a default (overridable).
function defaultLocale(): "ar" | "en" {
  const l = process.env.WHATSAPP_DEFAULT_LOCALE;
  return l === "en" ? "en" : routing.defaultLocale;
}

type WaMedia = { id?: string; mime_type?: string };
type WaMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  audio?: WaMedia;
  voice?: WaMedia;
};
export type WhatsAppPayload = {
  entry?: {
    changes?: { value?: { messages?: WaMessage[] } }[];
  }[];
};

/** Extract inbound user messages from the (deeply nested) webhook payload. */
function extractMessages(payload: WhatsAppPayload): WaMessage[] {
  const out: WaMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) out.push(m);
    }
  }
  return out;
}

async function handleMessage(m: WaMessage): Promise<void> {
  const from = m.from;
  if (!from) return;
  // Drop redelivered messages (Meta retries until it gets a 200).
  if (m.id && seenEventId(m.id)) return;

  const locale = defaultLocale();
  const text = (m.text?.body ?? "").trim();
  const media = m.voice ?? m.audio;

  try {
    const audio = media?.id ? await downloadWhatsAppMedia(media.id) : null;
    if (!text && !audio) return; // unsupported type (image, location, …)

    const { reply, capped } = await runChannelTurn({
      platform: PLATFORM,
      chatId: from,
      userText: text.slice(0, 2000),
      locale,
      audio: audio ?? undefined,
    });

    let sentVoice = false;
    if (
      await wantsVoice({ isVoiceIn: Boolean(media), capped: Boolean(capped) })
    ) {
      const ogg = await renderVoice(reply.text, locale);
      if (ogg) sentVoice = await sendWhatsAppVoice(from, ogg);
    }
    const voiceOnly = (await replyMode()) === "voice";
    const sendText = !voiceOnly || !sentVoice || reply.cards.length > 0;
    if (sendText) await sendWhatsAppText(from, formatReplyText(reply, locale));
  } catch (err) {
    console.error("[whatsapp] handler failed:", err);
    try {
      await sendWhatsAppText(
        from,
        locale === "ar"
          ? "عذرًا، حدث خطأ ما. حاول مرة أخرى بعد قليل."
          : "Sorry, something went wrong. Please try again shortly.",
      );
    } catch {
      // Give up silently.
    }
  }
}

export async function processWhatsAppPayload(
  payload: WhatsAppPayload,
): Promise<void> {
  for (const m of extractMessages(payload)) {
    await handleMessage(m);
  }
}
