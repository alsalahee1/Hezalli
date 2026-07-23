// Fail-fast environment validation. Runs once at server boot (via
// instrumentation.ts) so a misconfigured production deploy crashes loudly
// instead of failing mysteriously on the first request.
const REQUIRED_IN_PRODUCTION = ["DATABASE_URL", "AUTH_SECRET"];

export function assertEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]);

  // Conditional requirements: an integration that is configured MUST also carry
  // its request-verification secret. Without it the webhook now fails closed
  // (rejects every call), so a deploy that enabled the bot but forgot the secret
  // would silently drop all messages. Surface it loudly at boot instead.
  if (process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_WEBHOOK_SECRET) {
    missing.push(
      "TELEGRAM_WEBHOOK_SECRET (required whenever TELEGRAM_BOT_TOKEN is set)",
    );
  }
  if (process.env.WHATSAPP_TOKEN && !process.env.WHATSAPP_APP_SECRET) {
    missing.push(
      "WHATSAPP_APP_SECRET (required whenever WHATSAPP_TOKEN is set)",
    );
  }
  if (process.env.RESEND_API_KEY && !process.env.EMAIL_FROM) {
    missing.push("EMAIL_FROM (required whenever RESEND_API_KEY is set)");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in the host's environment before deploying.`,
    );
  }
}
