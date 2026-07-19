// Thin WhatsApp Cloud API (Meta Graph) client. Transport only — conversation
// logic is shared with Telegram via lib/ai/channel.ts.
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH = "https://graph.facebook.com";
const VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

function token(): string {
  const t = process.env.WHATSAPP_TOKEN;
  if (!t) throw new Error("WHATSAPP_TOKEN is not set");
  return t;
}
function phoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  return id;
}

/**
 * Verify the X-Hub-Signature-256 header against the raw request body using the
 * app secret. Returns true when no app secret is configured (verification off).
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  header: string | null,
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // opt-in; recommended for production
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = header.slice("sha256=".length);
  const a = Buffer.from(got, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function graph(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${GRAPH}/${VERSION}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token()}`, ...(init.headers ?? {}) },
  });
}

/** Send a plain-text message. */
export async function sendWhatsAppText(
  to: string,
  text: string,
): Promise<void> {
  const res = await graph(`${phoneNumberId()}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text.slice(0, 4096) },
    }),
  });
  if (!res.ok) {
    console.error(
      "[whatsapp] sendText",
      res.status,
      (await res.text()).slice(0, 200),
    );
  }
}

/** Download an inbound media object (voice/audio) as base64 for Gemini. */
export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const meta = await graph(mediaId, { method: "GET" });
    if (!meta.ok) return null;
    const info = (await meta.json()) as { url?: string; mime_type?: string };
    if (!info.url) return null;
    // The media URL itself also requires the bearer token.
    const bin = await fetch(info.url, {
      headers: { authorization: `Bearer ${token()}` },
    });
    if (!bin.ok) return null;
    const buf = Buffer.from(await bin.arrayBuffer());
    return {
      data: buf.toString("base64"),
      mimeType: info.mime_type || "audio/ogg",
    };
  } catch (e) {
    console.error("[whatsapp] media download failed:", e);
    return null;
  }
}

/** Upload an OGG/Opus clip and send it as an audio message. Returns success. */
export async function sendWhatsAppVoice(
  to: string,
  ogg: Buffer,
): Promise<boolean> {
  try {
    const fd = new FormData();
    fd.append("messaging_product", "whatsapp");
    fd.append("type", "audio/ogg");
    fd.append(
      "file",
      new Blob([new Uint8Array(ogg)], { type: "audio/ogg" }),
      "reply.ogg",
    );
    const up = await graph(`${phoneNumberId()}/media`, {
      method: "POST",
      body: fd,
    });
    if (!up.ok) return false;
    const { id } = (await up.json()) as { id?: string };
    if (!id) return false;

    const res = await graph(`${phoneNumberId()}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "audio",
        audio: { id },
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("[whatsapp] sendVoice failed:", e);
    return false;
  }
}
