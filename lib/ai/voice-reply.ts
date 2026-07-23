// Shared voice-reply policy + rendering for the messaging channels (Telegram,
// WhatsApp). Each channel decides *whether* to speak the same way and renders
// the same OGG/Opus audio; only the transport (how the audio is sent) differs.
// Every knob reads the admin-managed setting first (Admin → Shadi), then the
// env var, then a built-in default.
import "server-only";

import { getSetting } from "@/lib/settings";

import { recordTtsUsage } from "./guards";
import { synthesizeVoice } from "./tts";

export type ReplyMode = "text" | "voice" | "both" | "match";

function asReplyMode(raw: string): ReplyMode | null {
  const m = raw.toLowerCase();
  return m === "text" || m === "voice" || m === "both" || m === "match"
    ? m
    : null;
}

export async function replyMode(): Promise<ReplyMode> {
  try {
    const fromDb = asReplyMode(await getSetting("ai_reply_mode"));
    if (fromDb) return fromDb;
  } catch {
    // DB hiccup — fall through to env/default.
  }
  return asReplyMode(process.env.BOT_REPLY_MODE || "") ?? "text";
}

async function ttsVoice(): Promise<string> {
  try {
    const v = (await getSetting("ai_tts_voice")).trim();
    if (v) return v;
  } catch {
    // fall through
  }
  return process.env.BOT_TTS_VOICE || "Leda";
}

export async function ttsStyle(locale: string): Promise<string> {
  try {
    const s = (await getSetting("ai_tts_style")).trim();
    if (s) return s;
  } catch {
    // fall through
  }
  if (process.env.BOT_TTS_STYLE) return process.env.BOT_TTS_STYLE;
  return locale === "ar"
    ? "قل هذا بأسلوب ودّي وطبيعي كأنك مساعد متجر لطيف:"
    : "Say this warmly and naturally, like a friendly shop assistant:";
}

/**
 * Should this turn be spoken? Never on a capped turn (that would spend against
 * the cap we just hit). 'match' mirrors the customer: a voice note → voice.
 */
export async function wantsVoice(opts: {
  isVoiceIn: boolean;
  capped: boolean;
}): Promise<boolean> {
  if (opts.capped) return false;
  const mode = await replyMode();
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
    voice: await ttsVoice(),
    style: await ttsStyle(locale),
  });
  if (!tts) return null;
  void recordTtsUsage(tts.tokens, now).catch(() => {});
  return tts.ogg;
}
