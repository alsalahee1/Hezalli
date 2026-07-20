"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  rpConfig,
  readChallenge,
  saveChallenge,
  clearChallenge,
} from "@/lib/webauthn";

type Result<T = unknown> = { ok?: boolean; error?: string; data?: T };

// Step 1 of enrolment: issue registration options + store the challenge.
export async function startPasskeyRegistration(): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const existing = await prisma.walletCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });
  const { rpID, rpName } = rpConfig();

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: userId,
    userName: user?.email || user?.name || "Hezalli user",
    userDisplayName: user?.name || user?.email || "Hezalli user",
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: isoBase64URL.toBuffer(c.credentialId),
      type: "public-key" as const,
      transports: c.transports as never,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });

  await saveChallenge(userId, options.challenge, "register");
  return { ok: true, data: options };
}

// Step 2 of enrolment: verify the attestation and store the public key.
export async function finishPasskeyRegistration(
  responseJson: string,
  label?: string,
): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  let response: RegistrationResponseJSON;
  try {
    response = JSON.parse(responseJson) as RegistrationResponseJSON;
  } catch {
    return { error: "badPasskey" };
  }

  const expectedChallenge = await readChallenge(userId, "register");
  if (!expectedChallenge) return { error: "noChallenge" };

  const { origin, rpID } = rpConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return { error: "badPasskey" };
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { error: "badPasskey" };
  }

  const { credentialID, credentialPublicKey, counter } =
    verification.registrationInfo;
  await prisma.walletCredential.create({
    data: {
      userId,
      credentialId: isoBase64URL.fromBuffer(credentialID),
      publicKey: isoBase64URL.fromBuffer(credentialPublicKey),
      counter,
      transports: (response.response.transports ?? []) as string[],
      label: label?.trim() || null,
    },
  });
  await clearChallenge(userId);

  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}

// Called by the outflow forms right before submitting: issues authentication
// options (the passkey challenge) for the user's registered credentials.
export async function startWalletAuth(): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const creds = await prisma.walletCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });
  if (creds.length === 0) return { error: "noPasskey" };

  const { rpID } = rpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: creds.map((c) => ({
      id: isoBase64URL.toBuffer(c.credentialId),
      type: "public-key" as const,
      transports: c.transports as never,
    })),
  });

  await saveChallenge(userId, options.challenge, "auth");
  return { ok: true, data: options };
}

// List the user's passkeys (for the Security panel).
export async function listPasskeys(): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const creds = await prisma.walletCredential.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
  });
  return { ok: true, data: creds };
}

// Remove one of the caller's passkeys.
export async function removePasskey(credId: string): Promise<Result> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  await prisma.walletCredential.deleteMany({
    where: { id: credId, userId: session.user.id },
  });
  revalidatePath(`/${locale}/account/wallet`);
  return { ok: true };
}
