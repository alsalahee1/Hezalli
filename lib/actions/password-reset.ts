"use server";

import { createHash, randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import {
  fieldErrors,
  requestResetSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

// Password reset over email, built on the existing OtpToken table (no schema
// change) and the shared email adapter. A single-use, 30-minute reset token is
// generated, its SHA-256 hash stored (never the raw token), and a reset link
// emailed. Setting a new password verifies the hash, rotates the credential,
// and burns every outstanding reset token for that account.

const RESET_PURPOSE = "password_reset";
const RESET_TTL_MS = 30 * 60_000; // 30 minutes

// Shape returned to the client forms (via useActionState). Message values are
// i18n KEYS under the `Auth` namespace; the forms translate them. `sent`/`done`
// flip the form over to its confirmation state.
export type RequestResetState = {
  errors?: Record<string, string>;
  formError?: string;
  sent?: boolean;
};

export type ResetPasswordState = {
  errors?: Record<string, string>;
  formError?: string;
  done?: boolean;
};

// Best-effort client IP for rate-limiting (behind the platform's proxy).
async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

// Same-origin base URL for the reset link, derived from the incoming request so
// it works across the app's domains without extra configuration.
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "hezalli.com";
  const proto = h.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export async function requestPasswordReset(
  _prev: RequestResetState | undefined,
  formData: FormData,
): Promise<RequestResetState> {
  // Throttle enumeration/spam: at most 5 requests per IP per 15 minutes.
  if (
    !(await rateLimitAsync(`pwreset:${await clientIp()}`, 5, 15 * 60_000)).ok
  ) {
    return { formError: "tooManyAttempts" };
  }

  const parsed = requestResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { email } = parsed.data;
  const locale = await getLocale();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });

  // Only real accounts get an email, but the response is identical either way
  // so this endpoint can't be used to discover which addresses are registered.
  if (user) {
    const token = randomBytes(32).toString("hex");
    await prisma.otpToken.create({
      data: {
        userId: user.id,
        channel: "email",
        target: email,
        codeHash: sha256(token),
        purpose: RESET_PURPOSE,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const t = await getTranslations({ locale, namespace: "Auth" });
    const url = `${await origin()}/${locale}/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: t("resetEmailSubject"),
      body: t("resetEmailBody"),
      ctaLabel: t("resetEmailCta"),
      ctaUrl: url,
    });
  }

  return { sent: true };
}

export async function resetPassword(
  _prev: ResetPasswordState | undefined,
  formData: FormData,
): Promise<ResetPasswordState> {
  // Throttle brute-force against the token: at most 10 tries per IP per 15 min.
  if (
    !(await rateLimitAsync(`pwset:${await clientIp()}`, 10, 15 * 60_000)).ok
  ) {
    return { formError: "tooManyAttempts" };
  }

  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { token, password } = parsed.data;

  const record = await prisma.otpToken.findFirst({
    where: {
      codeHash: sha256(token),
      purpose: RESET_PURPOSE,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, userId: true },
  });

  // Missing, already-used, or expired link — same generic error either way.
  if (!record?.userId) return { formError: "resetLinkInvalid" };

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    // Burn every outstanding reset token for this account so an old link (or a
    // second one from a repeated request) can't be replayed.
    prisma.otpToken.updateMany({
      where: {
        userId: record.userId,
        purpose: RESET_PURPOSE,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    }),
  ]);

  return { done: true };
}
