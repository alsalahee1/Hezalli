"use server";

import { createHash, randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { sendEmail } from "@/lib/email";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { fieldErrors, resetPasswordSchema } from "@/lib/validations/auth";

// Password reset via a one-time emailed link. Tokens live in OtpToken
// (purpose "password_reset"): only the sha256 of the token is stored, so a DB
// leak cannot forge reset links. The request action always reports success —
// it never reveals whether an email has an account.

const PURPOSE = "password_reset";
const TOKEN_TTL_MS = 30 * 60_000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

export type ResetFormState = {
  errors?: Record<string, string>;
  formError?: string;
  done?: boolean;
};

export async function requestPasswordReset(
  _prev: ResetFormState | undefined,
  formData: FormData,
): Promise<ResetFormState> {
  if (!rateLimit(`pwreset:${await clientIp()}`, 5, 15 * 60_000).ok) {
    return { formError: "tooManyAttempts" };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { errors: { email: "emailInvalid" } };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true, isSuspended: true, locale: true },
  });

  // Issue a token only for a live account, but answer identically either way.
  if (user && !user.deletedAt && !user.isSuspended) {
    const token = randomBytes(32).toString("hex");
    await prisma.$transaction([
      // A new request supersedes any older outstanding links.
      prisma.otpToken.updateMany({
        where: { target: email, purpose: PURPOSE, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.otpToken.create({
        data: {
          userId: user.id,
          channel: "email",
          target: email,
          codeHash: tokenHash(token),
          purpose: PURPOSE,
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      }),
    ]);

    const locale = user.locale || (await getLocale());
    const base =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
      "http://localhost:3000";
    const t = await getTranslations({ locale, namespace: "Auth" });
    await sendEmail({
      to: email,
      subject: t("resetEmailSubject"),
      body: t("resetEmailBody"),
      ctaLabel: t("resetEmailCta"),
      ctaUrl: `${base}/${locale}/reset-password?token=${token}`,
    }).catch(() => {
      // Delivery problems must not reveal account existence either.
    });
  }

  return { done: true };
}

export async function resetPassword(
  _prev: ResetFormState | undefined,
  formData: FormData,
): Promise<ResetFormState> {
  if (!rateLimit(`pwreset-confirm:${await clientIp()}`, 10, 15 * 60_000).ok) {
    return { formError: "tooManyAttempts" };
  }

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const token = String(formData.get("token") ?? "");
  if (!token) return { formError: "resetLinkInvalid" };

  const record = await prisma.otpToken.findFirst({
    where: {
      codeHash: tokenHash(token),
      purpose: PURPOSE,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, target: true },
  });
  if (!record) return { formError: "resetLinkInvalid" };

  const user = await prisma.user.findUnique({
    where: { email: record.target },
    select: { id: true, deletedAt: true, isSuspended: true },
  });
  if (!user || user.deletedAt || user.isSuspended) {
    return { formError: "resetLinkInvalid" };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const result = await prisma.$transaction(async (tx) => {
    // Consume conditionally so a double-submitted link updates the password
    // exactly once (house pattern: conditional updateMany + count check).
    const consumed = await tx.otpToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) return false;
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    return true;
  });
  if (!result) return { formError: "resetLinkInvalid" };

  return { done: true };
}
