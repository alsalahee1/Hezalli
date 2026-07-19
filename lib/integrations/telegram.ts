// Thin Telegram Bot API client (send + webhook management). Transport only —
// conversation logic lives in lib/ai/channel.ts.
import "server-only";

const API_BASE = "https://api.telegram.org";

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

async function call(
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/bot${token()}/${method}`, {
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
  return data;
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
