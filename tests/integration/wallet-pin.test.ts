// Wallet PIN + brute-force lockout (Step 19.9). Verifies set/change, correct vs
// wrong verification, and that repeated wrong PINs lock the wallet.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<typeof import("next-intl/server")>()),
  getLocale: vi.fn().mockResolvedValue("en"),
}));

import { setWalletPin } from "@/lib/actions/wallet-pin";
import { prisma } from "@/lib/prisma";
import { getWalletId } from "@/lib/wallet";
import { verifyWalletPin, walletHasPin } from "@/lib/wallet-pin";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let userId: string;
const PIN = "2468";

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const u = await prisma.user.create({
    data: { email: `pin-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  userId = u.id;
  await getWalletId(userId);
});

afterAll(async () => {
  await prisma.wallet.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
});

describe("wallet PIN (Step 19.9)", () => {
  it("has no PIN until one is set", async () => {
    expect(await walletHasPin(userId)).toBe(false);
    // An outflow check with no PIN is refused.
    expect((await verifyWalletPin(userId, "0000")).error).toBe("noPin");
  });

  it("rejects a non-numeric or short PIN, then sets a valid one", async () => {
    as(userId);
    expect((await setWalletPin({ pin: "12" })).error).toBe("badPin");
    expect((await setWalletPin({ pin: "abcd" })).error).toBe("badPin");
    expect((await setWalletPin({ pin: PIN })).ok).toBe(true);
    expect(await walletHasPin(userId)).toBe(true);
  });

  it("verifies the correct PIN and rejects a wrong one", async () => {
    expect((await verifyWalletPin(userId, PIN)).ok).toBe(true);
    expect((await verifyWalletPin(userId, "0001")).error).toBe("wrongPin");
    // A correct verify resets the failure counter.
    expect((await verifyWalletPin(userId, PIN)).ok).toBe(true);
  });

  it("locks the wallet after 5 consecutive wrong PINs", async () => {
    let last;
    for (let i = 0; i < 5; i++) {
      last = await verifyWalletPin(userId, "9999");
    }
    expect(last!.error).toBe("locked");
    // Even the correct PIN is refused while locked.
    expect((await verifyWalletPin(userId, PIN)).error).toBe("locked");
  });

  it("changing the PIN requires proving the current one (step-up)", async () => {
    as(userId);
    // The change now proves the current factor through the SAME lockout-aware
    // path as an outflow (so the change endpoint can't be used to brute-force
    // the current PIN). Clear the lock left by the previous test to exercise the
    // change flow directly — while genuinely locked it correctly refuses.
    const walletId = await getWalletId(userId);
    await prisma.wallet.update({
      where: { id: walletId },
      data: { pinFailedCount: 0, pinLockedUntil: null },
    });
    expect(
      (await setWalletPin({ pin: "1111", currentPin: "0000" })).error,
    ).toBe("wrongCurrentPin");
    expect((await setWalletPin({ pin: "1111", currentPin: PIN })).ok).toBe(
      true,
    );
    // New PIN works.
    expect((await verifyWalletPin(userId, "1111")).ok).toBe(true);
  });

  it("blocks enrolling a first PIN on a passkey-protected wallet without the passkey (H1)", async () => {
    const uniq = Math.random().toString(36).slice(2);
    const u = await prisma.user.create({
      data: { email: `pk-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
    });
    await getWalletId(u.id);
    // A registered passkey is a step-up factor even with no PIN set.
    await prisma.walletCredential.create({
      data: {
        userId: u.id,
        credentialId: `cred-${uniq}`,
        publicKey: "test-key",
        transports: ["internal"],
      },
    });
    as(u.id);
    // Enrolling a first PIN must require proving the passkey — a bare session
    // cannot set one (else a hijacked session would bypass the passkey).
    expect((await setWalletPin({ pin: "4321" })).error).toBe("wrongCurrentPin");
    expect(await walletHasPin(u.id)).toBe(false);

    await prisma.walletCredential.deleteMany({ where: { userId: u.id } });
    await prisma.wallet.deleteMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { id: u.id } });
    as(userId); // restore the suite's actor
  });

  it("refuses to change the PIN while the wallet is locked", async () => {
    as(userId);
    const walletId = await getWalletId(userId);
    await prisma.wallet.update({
      where: { id: walletId },
      data: {
        pinFailedCount: 5,
        pinLockedUntil: new Date(Date.now() + 15 * 60_000),
      },
    });
    // Even with the correct current PIN, a locked wallet won't change its PIN —
    // the change endpoint is not a lockout bypass.
    expect(
      (await setWalletPin({ pin: "2222", currentPin: "1111" })).error,
    ).toBe("wrongCurrentPin");
  });
});
