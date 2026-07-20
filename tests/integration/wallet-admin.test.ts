// Admin wallet controls (Step 19.12): freeze/unfreeze + audited balance
// adjustments. Only request-context boundaries are mocked.
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

import {
  adjustWalletBalance,
  setWalletFrozen,
} from "@/lib/actions/wallet-admin";
import { prisma } from "@/lib/prisma";
import {
  getWalletId,
  getWalletView,
  recomputeWalletBalance,
} from "@/lib/wallet";

let userId: string;
let adminId: string;
let walletId: string;

const asAdmin = () => authMock.mockResolvedValue({ user: { id: adminId } });

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const u = await prisma.user.create({
    data: { email: `adm-w-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  const admin = await prisma.user.create({
    data: { email: `adm-a-${uniq}@t.local`, roles: ["ADMIN"], locale: "en" },
  });
  userId = u.id;
  adminId = admin.id;
  walletId = await getWalletId(userId);
  await prisma.walletEntry.create({
    data: { walletId, type: "TOP_UP", amountUsd: 50 },
  });
  await recomputeWalletBalance(userId);
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.walletEntry.deleteMany({ where: { walletId } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.auditLog
    .deleteMany({ where: { entityId: userId } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: [userId, adminId] } } })
    .catch(() => {});
});

describe("admin wallet controls (Step 19.12)", () => {
  it("freezes and unfreezes a wallet (audited)", async () => {
    asAdmin();
    expect((await setWalletFrozen(userId, true, "review")).ok).toBe(true);
    expect((await getWalletView(userId)).frozen).toBe(true);

    expect((await setWalletFrozen(userId, false)).ok).toBe(true);
    expect((await getWalletView(userId)).frozen).toBe(false);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: userId, action: { startsWith: "wallet." } },
    });
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it("adjusts the balance with an ADJUSTMENT entry and keeps balance = Σ entries", async () => {
    asAdmin();
    expect((await adjustWalletBalance(userId, 25, "goodwill")).ok).toBe(true);
    const view = await getWalletView(userId);
    expect(view.balance).toBe(75);
    expect(view.entries.some((e) => e.type === "ADJUSTMENT")).toBe(true);
  });

  it("requires a reason and refuses to push the balance negative", async () => {
    asAdmin();
    expect((await adjustWalletBalance(userId, 10, "  ")).error).toBe(
      "reasonRequired",
    );
    expect((await adjustWalletBalance(userId, -1000, "oops")).error).toBe(
      "wouldGoNegative",
    );
  });

  it("refuses everything for a non-admin", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    expect((await setWalletFrozen(userId, true)).error).toBe("forbidden");
    expect((await adjustWalletBalance(userId, 5, "x")).error).toBe("forbidden");
  });
});
