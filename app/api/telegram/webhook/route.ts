import { after, NextResponse, type NextRequest } from "next/server";

import { geminiConfigured } from "@/lib/ai/gemini";
import { telegramConfigured } from "@/lib/integrations/telegram";
import { seenTelegramUpdate } from "@/lib/integrations/telegram-dedup";
import {
  processTelegramUpdate,
  type TelegramUpdate,
} from "@/lib/integrations/telegram-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // Ack quietly when the bot isn't fully configured so Telegram stops retrying.
  if (!telegramConfigured() || !geminiConfigured()) {
    return NextResponse.json({ ok: true });
  }

  // Telegram echoes the secret we set via setWebhook. Fail CLOSED: a configured
  // bot MUST have a webhook secret set, and every update must present it —
  // otherwise an anonymous POST would be processed as a genuine Telegram update
  // (letting an attacker impersonate a linked user or burn the AI budget).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    !secret ||
    req.headers.get("x-telegram-bot-api-secret-token") !== secret
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Drop a redelivered update: Telegram resends the same update_id if we ACK
  // slowly, and reprocessing would run the customer's turn twice.
  const updateId =
    typeof update.update_id === "number" ? update.update_id : null;
  if (updateId !== null && seenTelegramUpdate(updateId)) {
    return NextResponse.json({ ok: true });
  }

  // Run the (slow) LLM turn AFTER responding, so we never exceed Telegram's
  // delivery timeout. `after` keeps the function alive until it settles.
  after(() =>
    processTelegramUpdate(update).catch((err) =>
      console.error("[telegram webhook] processing failed:", err),
    ),
  );

  return NextResponse.json({ ok: true });
}
