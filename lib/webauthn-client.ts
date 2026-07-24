"use client";

// Client-side WebAuthn ceremonies (Step 21). Thin wrappers over the browser
// passkey API + the server actions that issue/verify challenges.
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

import {
  finishPasskeyRegistration,
  startPasskeyRegistration,
  startWalletAuth,
} from "@/lib/actions/wallet-passkey";
import { startLoginPasskey } from "@/lib/actions/login-passkey";

export { browserSupportsWebAuthn };

// Run a first-factor biometric login: fetch discoverable-credential options,
// prompt the platform authenticator, and return the assertion JSON to hand to
// `loginWithPasskey`. Throws if there's no passkey / options fail / user cancels.
export async function getLoginPasskeyAssertion(): Promise<string> {
  const opts = await startLoginPasskey();
  if (!opts.ok || !opts.data) throw new Error(opts.error ?? "failed");
  const assertion = await startAuthentication(
    opts.data as Parameters<typeof startAuthentication>[0],
  );
  return JSON.stringify(assertion);
}

// Run a biometric assertion for an outflow; returns the response JSON to pass to
// the outflow action as `passkey`. Throws if there's no passkey or the user
// cancels the prompt.
export async function getPasskeyAssertion(): Promise<string> {
  const opts = await startWalletAuth();
  if (!opts.ok || !opts.data) throw new Error(opts.error ?? "noPasskey");
  const assertion = await startAuthentication(
    opts.data as Parameters<typeof startAuthentication>[0],
  );
  return JSON.stringify(assertion);
}

// Enrol this device's biometric (Face ID / fingerprint) as a wallet passkey.
export async function enrollPasskey(
  label?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const opts = await startPasskeyRegistration();
  if (!opts.ok || !opts.data) return { error: opts.error ?? "failed" };
  const registration = await startRegistration(
    opts.data as Parameters<typeof startRegistration>[0],
  );
  return finishPasskeyRegistration(JSON.stringify(registration), label);
}
