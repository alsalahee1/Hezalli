// Thin Telegram Bot API client (send + webhook management). Transport only —
// conversation logic lives in lib/ai/channel.ts.
//
// The bot token and webhook secret live in PlatformSetting rows
// ("telegram_bot_token" / "telegram_webhook_secret", written by the Admin →
// Shadi connect flow), with the TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET
// env vars as fallbacks. Like the Gemini key, they're kept out of
// getPlatformSettings() so the secrets never travel with the settings object.
import "server-only";

import { prisma } from "@/lib/prisma";

const API_BASE = "https://api.telegram.org";

async function settingRow(key: string): Promise<string> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    return typeof row?.value === "string" ? row.value.trim() : "";
  } catch {
    return "";
  }
}

export async function getTelegramToken(): Promise<string> {
  return (
    (await settingRow("telegram_bot_token")) ||
    (process.env.TELEGRAM_BOT_TOKEN || "").trim()
  );
}

export async function getTelegramWebhookSecret(): Promise<string> {
  return (
    (await settingRow("telegram_webhook_secret")) ||
    (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim()
  );
}

/** Where the active token comes from, for the admin UI. */
export async function telegramTokenSource(): Promise<"db" | "env" | "none"> {
  if (await settingRow("telegram_bot_token")) return "db";
  if ((process.env.TELEGRAM_BOT_TOKEN || "").trim()) return "env";
  return "none";
}

export async function telegramConfigured(): Promise<boolean> {
  return Boolean(await getTelegramToken());
}

async function token(): Promise<string> {
  const t = await getTelegramToken();
  if (!t) throw new Error("Telegram bot token is not configured");
  return t;
}

/** Low-level Bot API call with an explicit token (used by the connect flow). */
export async function telegramApi(
  botToken: string,
  method: string,
  body: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(
      `Telegram ${method} failed (${res.status}): ${data.description ?? "unknown error"}`,
    );
  }
  return data as Record<string, unknown>;
}

async function call(
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return telegramApi(await token(), method, body);
}

/** Send a plain-text message. Telegram auto-links bare URLs, so no markup. */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
): Promise<void> {
  // Telegram rejects messages over 4096 chars; trim defensively.
  await call("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096),
  });
}

/** Send an OGG/Opus voice note (multipart upload). Returns true on success. */
export async function sendTelegramVoice(
  chatId: number | string,
  ogg: Buffer,
): Promise<boolean> {
  try {
    const fd = new FormData();
    fd.append("chat_id", String(chatId));
    fd.append(
      "voice",
      new Blob([new Uint8Array(ogg)], { type: "audio/ogg" }),
      "reply.ogg",
    );
    const res = await fetch(`${API_BASE}/bot${await token()}/sendVoice`, {
      method: "POST",
      body: fd,
    });
    return res.ok;
  } catch (e) {
    console.error("[telegram] sendVoice failed:", e);
    return false;
  }
}

/** Show a "typing…" indicator while the assistant thinks. Best-effort. */
export async function sendTelegramTyping(
  chatId: number | string,
): Promise<void> {
  try {
    await call("sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {
    // Non-critical — ignore.
  }
}

/**
 * Download an incoming voice note / audio file and return it base64-encoded so
 * Gemini can transcribe and answer it. Returns null on any failure (the caller
 * falls back to treating the message as text-only).
 */
export async function downloadTelegramFile(
  fileId: string,
  fallbackMime = "audio/ogg",
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const t = await token();
    const info = (await call("getFile", { file_id: fileId })) as {
      result?: { file_path?: string };
    };
    const path = info.result?.file_path;
    if (!path) return null;
    const res = await fetch(`${API_BASE}/file/bot${t}/${path}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString("base64"), mimeType: fallbackMime };
  } catch {
    return null;
  }
}
