// Text → Telegram-ready voice note (OGG/Opus).
//
// Gemini TTS returns raw PCM (signed 16-bit LE, 24kHz, mono); we pipe it
// through ffmpeg to OGG/Opus so Telegram can send it as a real voice message.
// Everything is best-effort: any failure (no ffmpeg, TTS error, timeout)
// returns null and the caller falls back to a text reply.
//
// Requires the `ffmpeg` binary on the host — available on a VPS / Node server,
// but NOT on serverless platforms. Voice replies are opt-in via BOT_REPLY_MODE.
import "server-only";

import { spawn } from "node:child_process";

// A dedicated TTS-capable model (distinct from the chat model). Overridable.
const TTS_MODEL =
  process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const MAX_CHARS = 700; // keep voice replies short — bounds latency + cost
const FFMPEG_TIMEOUT_MS = 12_000;

export type TtsResult = { ogg: Buffer; tokens: number };

function pcmToOgg(pcm: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let ff;
    try {
      ff = spawn("ffmpeg", [
        "-f",
        "s16le",
        "-ar",
        "24000",
        "-ac",
        "1",
        "-i",
        "pipe:0",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-f",
        "ogg",
        "pipe:1",
      ]);
    } catch (e) {
      console.error("[tts] ffmpeg spawn failed:", e);
      return resolve(null);
    }
    const out: Buffer[] = [];
    let settled = false;
    const done = (buf: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(buf);
    };
    // If ffmpeg hangs (bad input, resource contention), kill it and fall back
    // to text rather than leaving the turn stuck forever.
    const timer = setTimeout(() => {
      console.error("[tts] ffmpeg timed out — killing");
      try {
        ff.kill("SIGKILL");
      } catch {
        // already gone
      }
      done(null);
    }, FFMPEG_TIMEOUT_MS);
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.on("error", (e) => {
      console.error("[tts] ffmpeg error:", e);
      done(null);
    });
    ff.on("close", (code) =>
      done(code === 0 && out.length ? Buffer.concat(out) : null),
    );
    ff.stdin.on("error", () => {}); // ignore EPIPE
    ff.stdin.write(pcm);
    ff.stdin.end();
  });
}

/**
 * Synthesize `text` to an OGG/Opus voice note. Returns the audio plus the TTS
 * token count (for spend tracking), or null on any failure.
 */
export async function synthesizeVoice(
  text: string,
  opts: { voice?: string; style?: string } = {},
): Promise<TtsResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const clean = (text || "").slice(0, MAX_CHARS).trim();
  if (!clean) return null;

  const voice = opts.voice || "Leda";
  // A natural-language style cue nudges tone/accent (Gemini TTS follows it).
  const prompt = opts.style ? `${opts.style}\n\n${clean}` : clean;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          },
        }),
      },
    );
    if (!res.ok) {
      console.error(
        "[tts] gemini",
        res.status,
        (await res.text()).slice(0, 200),
      );
      return null;
    }
    const data = (await res.json()) as {
      candidates?: {
        content?: { parts?: { inlineData?: { data?: string } }[] };
      }[];
      usageMetadata?: { candidatesTokenCount?: number };
    };
    const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
      ?.inlineData?.data;
    if (!b64) return null;

    const ogg = await pcmToOgg(Buffer.from(b64, "base64"));
    if (!ogg) return null;
    return { ogg, tokens: data.usageMetadata?.candidatesTokenCount ?? 0 };
  } catch (e) {
    console.error("[tts] failed:", e);
    return null;
  }
}
