// Fan a short notification out to a user's linked messaging bots (Telegram +
// WhatsApp). In Yemen WhatsApp/Telegram are where people live, so delivery
// updates land far better here than a PWA push. Best-effort and fully
// no-op-safe: unconfigured channels, unlinked users, and send failures are all
// swallowed so this can never break the flow that triggered it.
//
// WhatsApp note: the Cloud API only allows free-form text inside a 24h
// customer-service window; proactive delivery messages outside that window
// need an approved template. Telegram has no such limit, so linked Telegram
// users always receive these. WhatsApp is attempted best-effort.
import { prisma } from "@/lib/prisma";

export async function notifyBot(userId: string, text: string): Promise<void> {
  try {
    const chats = await prisma.botConversation.findMany({
      where: { userId },
      select: { platform: true, chatId: true },
    });
    if (chats.length === 0) return;

    // The bot modules are `server-only`; import them lazily so this module can
    // sit in server-action chains that unit tests statically import.
    const [tg, wa] = await Promise.all([
      import("@/lib/integrations/telegram"),
      import("@/lib/integrations/whatsapp"),
    ]);

    await Promise.all(
      chats.map(async (c) => {
        try {
          if (c.platform === "telegram" && tg.telegramConfigured()) {
            await tg.sendTelegramMessage(c.chatId, text);
          } else if (c.platform === "whatsapp" && wa.whatsappConfigured()) {
            await wa.sendWhatsAppText(c.chatId, text);
          }
        } catch {
          // per-chat failure must not abort the others
        }
      }),
    );
  } catch {
    // lookup failure is non-fatal — this is a courtesy channel
  }
}
