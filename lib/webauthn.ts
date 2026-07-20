// WebAuthn / passkey server core (Step 21). Plain module (no "use server") —
// callers pass the authenticated user id, so a passkey can never be verified
// against an arbitrary account. Powers biometric step-up for wallet outflows;
// the biometric never leaves the device (we store only public keys).
import {
  verifyAuthenticationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";

import { prisma } from "@/lib/prisma";

export type PasskeyResult = {
  ok?: boolean;
  error?: "noChallenge" | "unknownCredential" | "badPasskey";
};

// Relying-party identity, derived from the app URL (override with WEBAUTHN_*).
export function rpConfig(): { origin: string; rpID: string; rpName: string } {
  const url = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const origin = process.env.WEBAUTHN_ORIGIN ?? url;
  let rpID = process.env.WEBAUTHN_RP_ID;
  if (!rpID) {
    try {
      rpID = new URL(origin).hostname;
    } catch {
      rpID = "localhost";
    }
  }
  return { origin, rpID, rpName: "HezalliPay" };
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Store the single in-flight challenge for a user (register or auth). */
export async function saveChallenge(
  userId: string,
  challenge: string,
  purpose: "register" | "auth",
): Promise<void> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.walletWebauthnChallenge.upsert({
    where: { userId },
    create: { userId, challenge, purpose, expiresAt },
    update: { challenge, purpose, expiresAt },
  });
}

/** Read (without consuming) a valid challenge of the given purpose. */
export async function readChallenge(
  userId: string,
  purpose: "register" | "auth",
): Promise<string | null> {
  const row = await prisma.walletWebauthnChallenge.findUnique({
    where: { userId },
  });
  if (!row || row.purpose !== purpose || row.expiresAt < new Date())
    return null;
  return row.challenge;
}

export async function clearChallenge(userId: string): Promise<void> {
  await prisma.walletWebauthnChallenge
    .delete({ where: { userId } })
    .catch(() => {});
}

/** True if the user has at least one registered passkey. */
export async function walletHasPasskey(userId: string): Promise<boolean> {
  const n = await prisma.walletCredential.count({ where: { userId } });
  return n > 0;
}

/**
 * Verify a passkey assertion for an outflow. Matches the credential to the user,
 * checks it against the stored challenge, and bumps the signature counter.
 */
export async function verifyWalletPasskey(
  userId: string,
  responseJson: string,
): Promise<PasskeyResult> {
  let response: AuthenticationResponseJSON;
  try {
    response = JSON.parse(responseJson) as AuthenticationResponseJSON;
  } catch {
    return { error: "badPasskey" };
  }

  const expectedChallenge = await readChallenge(userId, "auth");
  if (!expectedChallenge) return { error: "noChallenge" };

  const cred = await prisma.walletCredential.findFirst({
    where: { userId, credentialId: response.id },
  });
  if (!cred) return { error: "unknownCredential" };

  const { origin, rpID } = rpConfig();
  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      authenticator: {
        credentialID: isoBase64URL.toBuffer(cred.credentialId),
        credentialPublicKey: isoBase64URL.toBuffer(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports as never,
      },
    });
  } catch {
    return { error: "badPasskey" };
  }

  if (!verification.verified) return { error: "badPasskey" };

  await prisma.walletCredential.update({
    where: { id: cred.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });
  await clearChallenge(userId);
  return { ok: true };
}
