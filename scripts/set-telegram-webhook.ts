/**
 * Register (or refresh) the Telegram webhook so updates are delivered to
 * `<NEXT_PUBLIC_APP_URL>/api/telegram/webhook`.
 *
 * Requires in `.env`:
 *   TELEGRAM_BOT_TOKEN       the bot token from @BotFather
 *   NEXT_PUBLIC_APP_URL      your public HTTPS base URL (must be reachable)
 *   TELEGRAM_WEBHOOK_SECRET  (optional but recommended) a shared secret
 *
 * Run with:  npm run telegram:webhook
 * Pass a URL to override the base:  npm run telegram:webhook -- https://xxxx.ngrok.io
 */
// NOTE: this runs under plain Node (tsx), so it must NOT import the
// `server-only` transport module — it calls the Telegram API directly.
import "dotenv/config";

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base = (
    process.argv[2] ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  ).replace(/\/+$/, "");
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in .env");
  }
  if (!base || !base.startsWith("https://")) {
    throw new Error(
      "Need a public HTTPS base URL — set NEXT_PUBLIC_APP_URL or pass one as an argument.",
    );
  }

  const url = `${base}/api/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: true,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.description ?? `HTTP ${res.status}`);
  }
  console.log(`✅ Telegram webhook set to ${url}`);
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    console.log(
      "⚠️  No TELEGRAM_WEBHOOK_SECRET set — anyone who guesses the URL could post updates. Set one for production.",
    );
  }
}

main().catch((err) => {
  console.error(
    "❌ Failed to set webhook:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
