import { describe, expect, it } from "vitest";

import { settleSubOrder } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";
import { getWalletView } from "@/lib/wallet";
import { makeFixture } from "./factory";

describe("refund to wallet (Step 19.1)", () => {
  it("credits the buyer wallet and keeps balance = Σ entries", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { orderId, subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
      });
      await settleSubOrder(subOrderId);

      const res = await applyRefund(subOrderId, {
        reason: "test",
        actor: "admin",
        toWallet: true,
      });
      expect(res.ok).toBe(true);
      expect(res.amount).toBe(100); // full paid amount

      const entries = await prisma.walletEntry.findMany({
        where: { orderId, type: "REFUND" },
      });
      expect(entries).toHaveLength(1);
      expect(Number(entries[0].amountUsd)).toBe(100);

      // The stored balance must equal the sum of the wallet's entries.
      const { balance } = await getWalletView(fx.buyerId);
      expect(balance).toBe(100);
    } finally {
      await prisma.walletEntry
        .deleteMany({ where: { wallet: { userId: fx.buyerId } } })
        .catch(() => {});
      await prisma.wallet
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });

  it("credits only a partial amount when asked", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
      });
      await settleSubOrder(subOrderId);

      const res = await applyRefund(subOrderId, {
        reason: "partial",
        amountUsd: 40,
        actor: "admin",
        toWallet: true,
      });
      expect(res.amount).toBe(40);

      const { balance } = await getWalletView(fx.buyerId);
      expect(balance).toBe(40);
    } finally {
      await prisma.walletEntry
        .deleteMany({ where: { wallet: { userId: fx.buyerId } } })
        .catch(() => {});
      await prisma.wallet
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });
});
