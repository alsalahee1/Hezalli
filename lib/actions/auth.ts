"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { getLocale } from "next-intl/server";

import { signIn, signOut } from "@/auth";
import { generateReferralCode } from "@/lib/loyalty";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
import {
  fieldErrors,
  loginSchema,
  registerSchema,
} from "@/lib/validations/auth";

// Best-effort client IP for rate-limiting (behind the platform's proxy).
async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

// Shape returned to the client forms (via useActionState). Message values are
// i18n KEYS under the `Auth` namespace; the forms translate them.
export type AuthFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

function safeCallbackUrl(value: FormDataEntryValue | null): string | undefined {
  // Only allow same-site relative paths to avoid open redirects.
  const raw = typeof value === "string" ? value : "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return undefined;
}

export async function authenticate(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  // Throttle brute-force: at most 8 attempts per IP per 5 minutes.
  if (!(await rateLimitAsync(`login:${await clientIp()}`, 8, 5 * 60_000)).ok) {
    return { formError: "tooManyAttempts" };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: formData.get("remember") === "on",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const locale = await getLocale();

  // Landing page after sign-in: an explicit callbackUrl wins; otherwise send
  // staff and role-app users straight to their dashboard, everyone else to
  // the storefront. Only the landing page changes — every role can still
  // browse the storefront freely (see #100).
  const dbUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { roles: true },
  });
  const roles = dbUser?.roles ?? [];
  const roleLanding = roles.includes("ADMIN")
    ? `/${locale}/admin`
    : roles.includes("WALLET_MANAGER")
      ? `/${locale}/wallet-manager`
      : roles.includes("DELIVERY_MANAGER")
        ? `/${locale}/delivery-manager`
        : roles.includes("SELLER")
          ? `/${locale}/seller`
          : roles.includes("COURIER")
            ? `/${locale}/driver`
            : roles.includes("DELIVERY_POINT")
              ? `/${locale}/point`
              : `/${locale}`;
  const redirectTo =
    safeCallbackUrl(formData.get("callbackUrl")) ?? roleLanding;

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
    });
  } catch (error) {
    // A successful sign-in throws a NEXT_REDIRECT that must propagate.
    if (error instanceof AuthError) return { formError: "invalidCredentials" };
    throw error;
  }
  return {};
}

// One-click "fast login" for testing (the /dev-login page). This is NOT an auth
// bypass: it submits the SAME credentials flow as the login form, pre-filled
// with a seed account's email and the known seed password — so it only works
// against seeded/test databases, and only while DEV_LOGIN_ENABLED === "true".
// Never enable that flag in production.
const SEED_PASSWORD = "hezalli123";

export async function devSignIn(formData: FormData): Promise<void> {
  if (process.env.DEV_LOGIN_ENABLED !== "true") return;
  const email = String(formData.get("email") ?? "").trim();
  // Restrict to the seed/demo domains as a second guard.
  if (!/@(hezalli\.com|example\.com)$/i.test(email)) return;

  const locale = await getLocale();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { roles: true },
  });
  const roles = user?.roles ?? [];
  const dest = roles.includes("ADMIN")
    ? `/${locale}/admin`
    : roles.includes("WALLET_MANAGER")
      ? `/${locale}/wallet-manager`
      : roles.includes("DELIVERY_MANAGER")
        ? `/${locale}/delivery-manager`
        : roles.includes("COURIER")
          ? `/${locale}/driver`
          : roles.includes("DELIVERY_POINT")
            ? `/${locale}/point`
            : roles.includes("SELLER")
              ? `/${locale}/seller`
              : `/${locale}`;

  try {
    await signIn("credentials", {
      email,
      password: SEED_PASSWORD,
      redirectTo: dest,
    });
  } catch (error) {
    // Success throws a NEXT_REDIRECT that must propagate; only swallow auth
    // failures (flag off / password changed) so the page simply reloads.
    if (error instanceof AuthError) return;
    throw error;
  }
}

export async function registerUser(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  // Throttle account-creation abuse: at most 5 per IP per 15 minutes.
  if (
    !(await rateLimitAsync(`register:${await clientIp()}`, 5, 15 * 60_000)).ok
  ) {
    return { formError: "tooManyAttempts" };
  }

  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms") === "on",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { errors: { email: "emailTaken" } };

  // Referral: a valid ?ref code links the new buyer to their referrer, who is
  // rewarded once this account completes its first order (see awardPurchasePoints).
  const refCode = String(formData.get("ref") ?? "").trim();
  let referredById: string | null = null;
  if (refCode) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: refCode },
      select: { id: true },
    });
    referredById = referrer?.id ?? null;
  }

  const locale = await getLocale();
  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      roles: ["BUYER"],
      locale,
      referralCode: generateReferralCode(),
      referredById,
    },
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: `/${locale}`,
    });
  } catch (error) {
    // Account was created; if auto-login fails, send them to log in manually.
    if (error instanceof AuthError)
      return { formError: "registeredLoginManually" };
    throw error;
  }
  return {};
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
