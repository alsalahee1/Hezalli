// Web Push (VAPID) sender for driver notifications. The whole feature is
// OPTIONAL: with no VAPID keys in the env it silently no-ops, exactly like the
// Telegram / WhatsApp integrations. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// and (optionally) VAPID_SUBJECT on the server to turn it on.
import webpush from "web-push";

import { prisma } from "@/lib/prisma";

let configured: boolean | null = null;

// Returns true once VAPID is configured (and configures web-push on first use).
export function pushEnabled(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@hezalli.com",
    pub,
    priv,
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string; // path to open on click (default /driver)
  tag?: string;
};

// Fire a push to every device the user has subscribed. Best-effort: never
// throws, and prunes subscriptions the push service reports as gone (404/410).
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!pushEnabled()) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
        else
          console.error("[push] send failed", {
            code,
            error: err instanceof Error ? err.message : err,
          });
      }
    }),
  );

  if (dead.length) {
    await prisma.pushSubscription
      .deleteMany({ where: { id: { in: dead } } })
      .catch(() => {});
  }
}
