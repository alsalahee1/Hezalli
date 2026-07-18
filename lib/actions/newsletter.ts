"use server";

import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public: capture a newsletter subscription. Re-subscribing clears a prior
// opt-out. Idempotent on email.
export async function subscribeNewsletter(emailRaw: string): Promise<Result> {
  const email = (emailRaw ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) return { error: "invalid" };

  const [locale, session] = await Promise.all([getLocale(), auth()]);
  await prisma.newsletterSubscriber.upsert({
    where: { email },
    create: { email, locale, userId: session?.user?.id ?? null },
    update: { unsubscribedAt: null, locale },
  });
  return { ok: true };
}

// Admin-only: fan a message out to every active subscriber through the (stubbed)
// email adapter. A real provider would batch/queue this; fine at launch scale.
export async function broadcastNewsletter(
  subject: string,
  body: string,
): Promise<Result & { sent?: number }> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const subj = (subject ?? "").trim();
  const text = (body ?? "").trim();
  if (subj.length < 3 || text.length < 3) return { error: "empty" };

  const subs = await prisma.newsletterSubscriber.findMany({
    where: { unsubscribedAt: null },
    select: { email: true },
  });
  let sent = 0;
  for (const s of subs) {
    await sendEmail({ to: s.email, subject: subj, body: text }).catch(() => {});
    sent++;
  }
  return { ok: true, sent };
}
