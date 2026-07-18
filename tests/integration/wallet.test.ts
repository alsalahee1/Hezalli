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

describe("wallet cashback on completion (Step 19.5)", () => {
  it("credits the configured rate to the buyer wallet, once", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    // Enable 5% cashback for this test.
    await prisma.platformSetting.upsert({
      where: { key: "wallet_cashback_rate" },
      create: { key: "wallet_cashback_rate", value: 0.05 },
      update: { value: 0.05 },
    });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
      });
      await settleSubOrder(subOrderId);
      // Second settle must not double-credit cashback.
      await settleSubOrder(subOrderId);

      const entries = await prisma.walletEntry.findMany({
        where: { wallet: { userId: fx.buyerId }, type: "CASHBACK" },
      });
      expect(entries).toHaveLength(1);
      expect(Number(entries[0].amountUsd)).toBe(5); // 5% of 100

      const { balance } = await getWalletView(fx.buyerId);
      expect(balance).toBe(5);
    } finally {
      await prisma.platformSetting
        .deleteMany({ where: { key: "wallet_cashback_rate" } })
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

describe("wallet withdrawal reserve/return (Step 19.4)", () => {
  it("reserves on request and returns the funds on rejection", async () => {
    const fx = await makeFixture();
    try {
      const walletId = await getWalletId(fx.buyerId);
      // Seed a balance via a TOP_UP entry.
      await prisma.walletEntry.create({
        data: { walletId, type: "TOP_UP", amountUsd: 100, note: "seed" },
      });
      await recomputeWalletBalance(fx.buyerId);

      // Reserve a $60 withdrawal (mirror requestWithdrawal's core).
      const w = await prisma.$transaction(async (tx) => {
        const upd = await tx.wallet.updateMany({
          where: { id: walletId, availableUsd: { gte: 60 } },
          data: { availableUsd: { decrement: 60 } },
        });
        expect(upd.count).toBe(1);
        const wd = await tx.walletWithdrawal.create({
          data: {
            walletId,
            amountUsd: 60,
            method: "wallet",
            destination: { provider: "Jawali", walletNumber: "770000000" },
            status: "REQUESTED",
          },
        });
        await creditWalletTx(tx, walletId, {
          type: "CASHOUT",
          amountUsd: -60,
          note: "reserve",
        });
        return wd;
      });
      await recomputeWalletBalance(fx.buyerId);
      expect((await getWalletView(fx.buyerId)).balance).toBe(40);

      // Reject → return the reserved funds.
      await prisma.$transaction(async (tx) => {
        await tx.walletWithdrawal.update({
          where: { id: w.id },
          data: { status: "REJECTED" },
        });
        await creditWalletTx(tx, walletId, {
          type: "ADJUSTMENT",
          amountUsd: 60,
          note: "return",
        });
      });
      await recomputeWalletBalance(fx.buyerId);
      expect((await getWalletView(fx.buyerId)).balance).toBe(100);
    } finally {
      await prisma.walletWithdrawal
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
