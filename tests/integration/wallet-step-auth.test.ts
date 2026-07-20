// Unified wallet step-up authorization (Step 21). Verifies the PIN path still
// works and that a passkey path fails safely (routing + fallback), without a
// real authenticator.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getWalletId } from "@/lib/wallet";
import { verifyWalletAuth } from "@/lib/wallet-step-auth";
import { walletHasPasskey } from "@/lib/webauthn";

let userId: string;
let walletId: string;
const PIN = "2468";

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const u = await prisma.user.create({
    data: { email: `stepauth-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  userId = u.id;
  walletId = await getWalletId(userId);
  await prisma.wallet.update({
    where: { id: walletId },
    data: { pinHash: await hashPassword(PIN) },
  });
});

afterAll(async () => {
  await prisma.walletCredential
    .deleteMany({ where: { userId } })
    .catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
});

describe("wallet step-up auth (Step 21)", () => {
  it("authorizes with the correct PIN and rejects a wrong one", async () => {
    expect((await verifyWalletAuth(userId, { pin: PIN })).ok).toBe(true);
    expect((await verifyWalletAuth(userId, { pin: "0000" })).error).toBe(
      "wrongPin",
    );
  });

  it("has no passkey until one is registered", async () => {
    expect(await walletHasPasskey(userId)).toBe(false);
  });

  it("fails safely when a passkey assertion can't be verified", async () => {
    // Malformed assertion → passkey verification fails → collapses to wrongPin.
    expect(
      (await verifyWalletAuth(userId, { passkey: "not-json" })).error,
    ).toBe("wrongPin");
    // Well-formed but no server challenge / unknown credential → still rejected.
    expect(
      (
        await verifyWalletAuth(userId, {
          passkey: JSON.stringify({ id: "nope", response: {} }),
        })
      ).error,
    ).toBe("wrongPin");
  });
});
