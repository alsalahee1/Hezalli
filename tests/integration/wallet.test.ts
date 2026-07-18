import { describe, expect, it } from "vitest";

import { settleSubOrder } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";
import {
  creditWalletTx,
  getWalletId,
  getWalletView,
  recomputeWalletBalance,
} from "@/lib/wallet";
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

  it("auto-refunds a wallet-paid order back to the wallet", async () => {
    // A HEZALLI_BALANCE order must return funds to the wallet even when the
    // caller does not pass toWallet — that is where the money came from.
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "HEZALLI_BALANCE",
      });
      await settleSubOrder(subOrderId);

      const res = await applyRefund(subOrderId, {
        reason: "wallet order",
        actor: "admin",
        // note: no toWallet flag
      });
      expect(res.amount).toBe(100);

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

describe("wallet top-up ledger (Step 19.3)", () => {
  it("a confirmed TOP_UP credit keeps balance = Σ entries", async () => {
    const fx = await makeFixture();
    try {
      const walletId = await getWalletId(fx.buyerId);
      // Mirror confirmTopUp's core: mark a top-up confirmed + write the entry.
      const topUp = await prisma.walletTopUp.create({
        data: {
          walletId,
          method: "LOCAL_WALLET",
          amountUsd: 75,
          status: "AWAITING_CONFIRMATION",
          reference: "JAWALI-TEST",
        },
      });
      await prisma.$transaction(async (tx) => {
        await tx.walletTopUp.update({
          where: { id: topUp.id },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
        await creditWalletTx(tx, walletId, {
          type: "TOP_UP",
          amountUsd: 75,
          note: "test top-up",
        });
      });
      await recomputeWalletBalance(fx.buyerId);

      const entries = await prisma.walletEntry.findMany({
        where: { walletId, type: "TOP_UP" },
      });
      expect(entries).toHaveLength(1);
      const { balance } = await getWalletView(fx.buyerId);
      expect(balance).toBe(75);
    } finally {
      await prisma.walletTopUp
        .deleteMany({ where: { wallet: { userId: fx.buyerId } } })
        .catch(() => {});
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
