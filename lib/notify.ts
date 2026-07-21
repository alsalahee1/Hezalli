// Central notification helper. Writes an in-app Notification and (via the
// email adapter) sends an email. All notification points should funnel through
// here so the two channels stay in sync. `data.link` (a locale-less path) makes
// a notification clickable; otherwise the center falls back to a role-based
// route derived from ids in `data`.
import { sendEmail } from "@/lib/email";
import type { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { isEmailEnabled, isPushEnabled } from "@/lib/notif-prefs";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
  email?: boolean; // default true
  push?: boolean; // default true
};

export async function notify(input: NotifyInput): Promise<void> {
  const data = { ...(input.data ?? {}) };
  if (input.link) data.link = input.link;

  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: data as Prisma.InputJsonValue,
    },
  });

  const wantsEmail = input.email !== false;
  const wantsPush = input.push !== false;
  if (wantsEmail || wantsPush) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, notificationPrefs: true },
    });
    // In-app is always delivered; email and push each honour the user's
    // category toggles.
    if (
      wantsEmail &&
      user?.email &&
      isEmailEnabled(user.notificationPrefs, input.type)
    ) {
      await sendEmail({
        to: user.email,
        subject: input.title,
        body: input.body ?? "",
      }).catch(() => {});
    }
    if (wantsPush && isPushEnabled(user?.notificationPrefs, input.type)) {
      await sendPushToUser(input.userId, {
        title: input.title,
        body: input.body ?? "",
        url: typeof data.link === "string" ? data.link : undefined,
        tag: input.type,
      });
    }
  }
}

export { notificationHref, type NotifVariant } from "@/lib/notifications";
