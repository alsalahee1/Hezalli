// Bill/airtime fulfilment providers (Step 19.13). Proves the swappable seam:
// a registered provider auto-completes or auto-fails (refunds) a purchase inline,
// while the default "manual" provider leaves it PENDING for an admin.
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

import { payBill } from "@/lib/actions/wallet-bills";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { registerBillProvider } from "@/lib/providers/bill-provider";
import {
  getWalletId,
  getWalletView,
  recomputeWalletBalance,
} from "@/lib/wallet";

const PIN = "9911";
let userId: string;
let walletId: string;

const as = (id: string) => authMock.mockResolvedValue({ user: { id } });

async function setProvider(id: string) {
  await prisma.platformSetting.upsert({
    where: { key: "wallet_bills_provider" },
    create: { key: "wallet_bills_provider", value: id },
    update: { value: id },
  });
}

// Register two deterministic test providers.
registerBillProvider({
  id: "test-complete",
  async fulfill() {
    return { status: "COMPLETED", reference: "PRV-1" };
  },
});
registerBillProvider({
  id: "test-fail",
  async fulfill() {
    return { status: "FAILED", reason: "declined by provider" };
  },
});

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const u = await prisma.user.create({
    data: { email: `prov-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  userId = u.id;
  walletId = await getWalletId(userId);
  await prisma.walletEntry.create({
    data: { walletId, type: "TOP_UP", amountUsd: 300 },
  });
  await prisma.wallet.update({
    where: { id: walletId },
    data: { pinHash: await hashPassword(PIN) },
  });
  await recomputeWalletBalance(userId);
  await prisma.platformSetting.upsert({
    where: { key: "wallet_bills_enabled" },
    create: { key: "wallet_bills_enabled", value: true },
    update: { value: true },
  });
  as(userId);
});

afterAll(async () => {
  await prisma.walletBillPayment
    .deleteMany({ where: { walletId } })
    .catch(() => {});
  await prisma.walletEntry.deleteMany({ where: { walletId } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
  for (const key of ["wallet_bills_enabled", "wallet_bills_provider"]) {
    await prisma.platformSetting.deleteMany({ where: { key } }).catch(() => {});
  }
});

describe("bill fulfilment providers (Step 19.13)", () => {
  it("auto-completes when the provider confirms", async () => {
    await setProvider("test-complete");
    const res = await payBill({
      kind: "BILL",
      biller: "public-electricity",
      account: "111",
      amountUsd: 30,
      pin: PIN,
    });
    expect(res.ok).toBe(true);
    const bill = await prisma.walletBillPayment.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(bill.status).toBe("COMPLETED");
    expect(bill.reference).toBe("PRV-1");
    // Funds stay debited: 300 − 30.
    expect((await getWalletView(userId)).balance).toBe(270);
  });

  it("auto-fails and refunds when the provider declines", async () => {
    await setProvider("test-fail");
    const res = await payBill({
      kind: "AIRTIME",
      biller: "yemen-mobile",
      account: "770",
      amountUsd: 20,
      pin: PIN,
    });
    expect(res.ok).toBe(true);
    const bill = await prisma.walletBillPayment.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(bill.status).toBe("FAILED");
    // Debited 20 then refunded 20 → back to 270.
    expect((await getWalletView(userId)).balance).toBe(270);
  });

  it("leaves the purchase PENDING under the manual provider", async () => {
    await setProvider("manual");
    const res = await payBill({
      kind: "BILL",
      biller: "yemen-net",
      account: "ACC",
      amountUsd: 10,
      pin: PIN,
    });
    expect(res.ok).toBe(true);
    const bill = await prisma.walletBillPayment.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(bill.status).toBe("PENDING");
    expect((await getWalletView(userId)).balance).toBe(260);
  });
});
