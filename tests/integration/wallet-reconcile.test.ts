// Wallet liability + ledger-integrity reconciliation (Step 19.11). Verifies drift
// detection when a stored balance diverges from Σ entries, and that the admin
// reconcile action repairs it.
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

import { reconcileWalletBalance } from "@/lib/actions/wallet-reconcile";
import { prisma } from "@/lib/prisma";
import { getWalletId, recomputeWalletBalance } from "@/lib/wallet";
import { findDriftedWallets } from "@/lib/wallet-reconcile";

let userId: string;
let adminId: string;
let walletId: string;

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const u = await prisma.user.create({
    data: { email: `rec-${uniq}@t.local`, name: "Rec User", roles: ["BUYER"] },
  });
  const admin = await prisma.user.create({
    data: { email: `rec-admin-${uniq}@t.local`, roles: ["ADMIN"] },
  });
  userId = u.id;
  adminId = admin.id;
  walletId = await getWalletId(userId);
  await prisma.walletEntry.create({
    data: { walletId, type: "TOP_UP", amountUsd: 100 },
  });
  await recomputeWalletBalance(userId);
});

afterAll(async () => {
  await prisma.walletEntry.deleteMany({ where: { walletId } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.auditLog
    .deleteMany({ where: { entityId: userId } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: [userId, adminId] } } })
    .catch(() => {});
});

describe("wallet reconciliation (Step 19.11)", () => {
  it("detects a wallet whose stored balance drifts from the ledger", async () => {
    // Tamper the stored balance out of band (simulating a bad edit).
    await prisma.wallet.update({
      where: { id: walletId },
      data: { availableUsd: 137 },
    });

    const drifted = await findDriftedWallets();
    const mine = drifted.find((d) => d.userId === userId);
    expect(mine).toBeTruthy();
    expect(mine!.stored).toBe(137);
    expect(mine!.computed).toBe(100);
    expect(mine!.diff).toBe(37);
  });

  it("repairs the drift on admin reconcile", async () => {
    authMock.mockResolvedValue({ user: { id: adminId } });
    const res = await reconcileWalletBalance(userId);
    expect(res.ok).toBe(true);

    const w = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
    });
    expect(Number(w.availableUsd)).toBe(100);
    expect((await findDriftedWallets()).find((d) => d.userId === userId)).toBe(
      undefined,
    );
  });

  it("refuses reconcile for a non-admin", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    expect((await reconcileWalletBalance(userId)).error).toBe("forbidden");
  });
});
