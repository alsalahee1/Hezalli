"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { getLocale } from "next-intl/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { signIn } from "@/auth";
import { rateLimitAsync } from "@/lib/rate-limit";
import { rpConfig, saveLoginChallenge } from "@/lib/webauthn";

type Result<T = unknown> = { ok?: boolean; error?: string; data?: T };

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

// Only allow same-site relative paths as a post-login destination.
function safeCallbackUrl(value?: string): string | undefined {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return undefined;
}

// Step 1 of a biometric login: issue authentication options for a DISCOVERABLE
// credential (empty allowCredentials → the browser offers every passkey it holds
// for this site, no email needed) and persist the one-time challenge.
export async function startLoginPasskey(): Promise<Result> {
  // Light throttle so the endpoint can't be used to mint unbounded challenges.
  if (
    !(await rateLimitAsync(`login-passkey:${await clientIp()}`, 20, 5 * 60_000))
      .ok
  ) {
    return { error: "tooManyAttempts" };
  }

  const { rpID } = rpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: [], // discoverable / usernameless
  });

  await saveLoginChallenge(options.challenge);
  return { ok: true, data: options };
}

// Step 2: hand the signed assertion to the `passkey` auth provider, which
// verifies it and (on success) starts the session. Mirrors `authenticate`: a
// successful sign-in throws NEXT_REDIRECT that must propagate; only real auth
// failures are turned into a friendly error for the form.
export async function loginWithPasskey(
  assertionJson: string,
  callbackUrl?: string,
): Promise<{ error?: string }> {
  const locale = await getLocale();
  // Role-aware landing is resolved on the next request by /[locale]/continue
  // (we don't know the user's roles here without consuming the assertion twice).
  const redirectTo = safeCallbackUrl(callbackUrl) ?? `/${locale}/continue`;

  try {
    await signIn("passkey", { assertion: assertionJson, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) return { error: "invalidPasskey" };
    throw error;
  }
  return {};
}
