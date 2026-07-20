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

  it("changing the PIN requires the current one and clears the lock", async () => {
    as(userId);
    expect(
      (await setWalletPin({ pin: "1111", currentPin: "0000" })).error,
    ).toBe("wrongCurrentPin");
    expect((await setWalletPin({ pin: "1111", currentPin: PIN })).ok).toBe(
      true,
    );
    // New PIN works and the lockout is gone.
    expect((await verifyWalletPin(userId, "1111")).ok).toBe(true);
  });
});
