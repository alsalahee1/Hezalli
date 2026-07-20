// Outflow velocity limits (Step 19.10). Verifies the rolling daily/monthly caps
// count only outflows and block once the projected total would exceed the cap.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getWalletId, recomputeWalletBalance } from "@/lib/wallet";
import { checkOutflowLimit } from "@/lib/wallet-velocity";

let userId: string;
let walletId: string;

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const u = await prisma.user.create({
    data: { email: `vel-${uniq}@t.local`, roles: ["BUYER"], locale: "en" },
  });
  userId = u.id;
  walletId = await getWalletId(userId);

  // Set explicit caps: daily 1000, monthly 5000.
  for (const [key, value] of [
    ["wallet_daily_outflow_usd", 1000],
    ["wallet_monthly_outflow_usd", 5000],
  ] as const) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  // Fund + already spent $900 out today (TRANSFER_OUT is an outflow type).
  await prisma.walletEntry.createMany({
    data: [
      { walletId, type: "TOP_UP", amountUsd: 5000 },
      { walletId, type: "TRANSFER_OUT", amountUsd: -900 },
    ],
  });
  await recomputeWalletBalance(userId);
});

afterAll(async () => {
  await prisma.walletEntry.deleteMany({ where: { walletId } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
  for (const key of [
    "wallet_daily_outflow_usd",
    "wallet_monthly_outflow_usd",
  ]) {
    await prisma.platformSetting.deleteMany({ where: { key } }).catch(() => {});
  }
});

describe("wallet outflow velocity (Step 19.10)", () => {
  it("allows an outflow that stays within the daily cap", async () => {
    // 900 already out + 100 = 1000, exactly the cap.
    expect((await checkOutflowLimit(userId, 100)).ok).toBe(true);
  });

  it("blocks an outflow that would exceed the daily cap", async () => {
    // 900 + 200 = 1100 > 1000.
    expect((await checkOutflowLimit(userId, 200)).error).toBe("dailyLimit");
  });

  it("ignores non-outflow entries (an order payment doesn't count)", async () => {
    await prisma.walletEntry.create({
      data: { walletId, type: "PAYMENT", amountUsd: -500 },
    });
    // Still only 900 of outflow counted, so 100 is fine.
    expect((await checkOutflowLimit(userId, 100)).ok).toBe(true);
  });

  it("treats a cap of 0 as no limit", async () => {
    // Disable the daily cap; the previously-blocked $200 now passes (monthly
    // cap of 5000 still has plenty of room: 900 + 200 < 5000).
    await prisma.platformSetting.update({
      where: { key: "wallet_daily_outflow_usd" },
      data: { value: 0 },
    });
    expect((await checkOutflowLimit(userId, 200)).ok).toBe(true);
  });
});
