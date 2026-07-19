// Shared voice-reply policy + rendering for the messaging channels (Telegram,
// WhatsApp). Each channel decides *whether* to speak the same way and renders
// the same OGG/Opus audio; only the transport (how the audio is sent) differs.
import "server-only";

import { recordTtsUsage } from "./guards";
import { synthesizeVoice } from "./tts";

export type ReplyMode = "text" | "voice" | "both" | "match";

export function replyMode(): ReplyMode {
  const m = (process.env.BOT_REPLY_MODE || "text").toLowerCase();
  return m === "voice" || m === "both" || m === "match" ? m : "text";
}

export function ttsStyle(locale: string): string {
  if (process.env.BOT_TTS_STYLE) return process.env.BOT_TTS_STYLE;
  return locale === "ar"
    ? "قل هذا بأسلوب ودّي وطبيعي كأنك مساعد متجر لطيف:"
    : "Say this warmly and naturally, like a friendly shop assistant:";
}

/**
 * Should this turn be spoken? Never on a capped turn (that would spend against
 * the cap we just hit). 'match' mirrors the customer: a voice note → voice.
 */
export function wantsVoice(opts: {
  isVoiceIn: boolean;
  capped: boolean;
}): boolean {
  if (opts.capped) return false;
  const mode = replyMode();
  return (
    mode === "voice" || mode === "both" || (mode === "match" && opts.isVoiceIn)
  );
}

/**
 * Render a reply to an OGG/Opus voice note and account for its TTS cost.
 * Returns null on any failure so the caller falls back to text.
 */
export async function renderVoice(
  text: string,
  locale: string,
  now: number = Date.now(),
): Promise<Buffer | null> {
  const tts = await synthesizeVoice(text, {
    voice: process.env.BOT_TTS_VOICE,
    style: ttsStyle(locale),
  });
  if (!tts) return null;
  void recordTtsUsage(tts.tokens, now).catch(() => {});
  return tts.ogg;
}
