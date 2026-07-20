// Concurrency / state-machine guards on money-moving actions (audit remediation).
//
// Every test here fires the REAL server action (not a hand-rolled mirror) and,
// where a race is the risk, fires it twice concurrently. The invariant asserted
// is always "money moved at most once": the conditional status flips, partial
// unique indexes, and row locks added in this change must make a concurrent or
// invalid second call a no-op — never a double credit/debit.
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

import { settleSubOrder } from "@/lib/finance";
import { confirmTopUp } from "@/lib/actions/wallet-topup";
import { markPayoutPaid } from "@/lib/actions/payout";
import { confirmPayment } from "@/lib/actions/payment";
import { cancelSubOrder } from "@/lib/actions/seller-order";
import { transferEarningsToWallet } from "@/lib/actions/wallet-transfer";
import {
  markWithdrawalPaid,
  rejectWithdrawal,
} from "@/lib/actions/wallet-withdrawal";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";
import { creditWalletTx, getWalletId, getWalletView } from "@/lib/wallet";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let adminId: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: `guard-admin-${Date.now().toString(36)}@t.local`,
      roles: ["ADMIN"],
      locale: "en",
    },
  });
  adminId = admin.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
});

describe("confirmTopUp — concurrent double-confirm credits once", () => {
  it("two simultaneous confirms produce exactly one TOP_UP entry", async () => {
    const fx = await makeFixture();
    try {
      const walletId = await getWalletId(fx.buyerId);
      const topUp = await prisma.walletTopUp.create({
        data: {
          walletId,
          method: "LOCAL_WALLET",
          amountUsd: 75,
          status: "AWAITING_CONFIRMATION",
          reference: "JAWALI-TEST",
        },
      });

      as(adminId);
      const results = await Promise.all([
        confirmTopUp(topUp.id),
        confirmTopUp(topUp.id),
      ]);

      // Exactly one call credited; the other saw the already-confirmed state.
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => r.error === "badState")).toHaveLength(1);

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

describe("settleSubOrder — concurrent settle credits once", () => {
  it("two simultaneous settles produce one SALE entry and one EARN", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
        status: "DELIVERED",
      });

      await Promise.all([
        settleSubOrder(subOrderId),
        settleSubOrder(subOrderId),
      ]);

      const sales = await prisma.ledgerEntry.findMany({
        where: { subOrderId, type: "SALE" },
      });
      expect(sales).toHaveLength(1);
      expect(Number(sales[0].amountUsd)).toBe(90); // 100 − 10% commission

      // The seller's available balance reflects a single credit.
      const bal = await prisma.sellerBalance.findUnique({
        where: { sellerId: fx.sellerProfileId },
        select: { availableUsd: true },
      });
      expect(Number(bal?.availableUsd)).toBe(90);

      // Loyalty EARN is awarded exactly once as well.
      const earns = await prisma.loyaltyTransaction.findMany({
        where: { subOrderId, type: "EARN" },
      });
      expect(earns).toHaveLength(1);
    } finally {
      await prisma.loyaltyTransaction
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });
});

describe("markPayoutPaid — concurrent pay debits once", () => {
  it("two simultaneous pays produce one PAYOUT ledger entry", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
        status: "DELIVERED",
      });
      await settleSubOrder(subOrderId); // seller now has $90 available

      const payout = await prisma.payout.create({
        data: {
          sellerId: fx.sellerProfileId,
          amountUsd: 90,
          method: "bank",
          destination: {},
          status: "REQUESTED",
        },
      });

      as(adminId);
      const results = await Promise.all([
        markPayoutPaid(payout.id, "ref-1"),
        markPayoutPaid(payout.id, "ref-2"),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);

      const debits = await prisma.ledgerEntry.findMany({
        where: { payoutId: payout.id, type: "PAYOUT" },
      });
      expect(debits).toHaveLength(1);
      expect(Number(debits[0].amountUsd)).toBe(-90);
    } finally {
      await prisma.loyaltyTransaction
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await prisma.payout
        .deleteMany({ where: { sellerId: fx.sellerProfileId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });
});

describe("applyRefund — cumulative refunds cannot exceed the paid amount", () => {
  it("caps the second partial and rejects a third", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "HEZALLI_BALANCE",
        status: "DELIVERED",
      });
      await settleSubOrder(subOrderId);

      const r1 = await applyRefund(subOrderId, {
        reason: "partial 1",
        amountUsd: 60,
        actor: "admin",
      });
      expect(r1.amount).toBe(60);

      // Only $40 remains — a second $60 request is capped to $40.
      const r2 = await applyRefund(subOrderId, {
        reason: "partial 2",
        amountUsd: 60,
        actor: "admin",
      });
      expect(r2.amount).toBe(40);

      // Nothing remains — a third refund is rejected.
      const r3 = await applyRefund(subOrderId, {
        reason: "partial 3",
        amountUsd: 10,
        actor: "admin",
      });
      expect(r3.error).toBe("badState");

      // Total refunded to the wallet is exactly the paid amount, never more.
      const { balance } = await getWalletView(fx.buyerId);
      expect(balance).toBe(100);
    } finally {
      await prisma.walletEntry
        .deleteMany({ where: { wallet: { userId: fx.buyerId } } })
        .catch(() => {});
      await prisma.wallet
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await prisma.loyaltyTransaction
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });

  it("two concurrent full refunds refund the paid amount only once", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "HEZALLI_BALANCE",
        status: "DELIVERED",
      });
      await settleSubOrder(subOrderId);
      // A wallet-paying buyer already has a wallet; pre-create it so the test
      // exercises the refund race, not first-touch wallet creation.
      await getWalletId(fx.buyerId);

      await Promise.all([
        applyRefund(subOrderId, { reason: "full a", actor: "admin" }),
        applyRefund(subOrderId, { reason: "full b", actor: "admin" }),
      ]);

      const refunds = await prisma.refund.findMany({ where: { subOrderId } });
      const total = refunds.reduce((s, r) => s + Number(r.amountUsd), 0);
      expect(total).toBe(100); // not 200

      const { balance } = await getWalletView(fx.buyerId);
      expect(balance).toBe(100);
    } finally {
      await prisma.walletEntry
        .deleteMany({ where: { wallet: { userId: fx.buyerId } } })
        .catch(() => {});
      await prisma.wallet
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await prisma.loyaltyTransaction
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });
});

describe("transferEarningsToWallet — concurrent 'move all' moves once", () => {
  it("two simultaneous transfers do not over-draw the seller ledger", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
        status: "DELIVERED",
      });
      await settleSubOrder(subOrderId); // $90 available
      await getWalletId(fx.sellerUserId); // pre-create wallet (see note above)

      as(fx.sellerUserId);
      const results = await Promise.all([
        transferEarningsToWallet(),
        transferEarningsToWallet(),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);

      // Exactly one WALLET_TRANSFER debit of −90; seller available nets to 0.
      const transfers = await prisma.ledgerEntry.findMany({
        where: { balanceId: fx.balanceId, type: "WALLET_TRANSFER" },
      });
      expect(transfers).toHaveLength(1);
      expect(Number(transfers[0].amountUsd)).toBe(-90);

      const bal = await prisma.sellerBalance.findUnique({
        where: { sellerId: fx.sellerProfileId },
        select: { availableUsd: true },
      });
      expect(Number(bal?.availableUsd)).toBe(0);

      // The wallet received the earnings exactly once.
      const { balance } = await getWalletView(fx.sellerUserId);
      expect(balance).toBe(90);
    } finally {
      await prisma.walletEntry
        .deleteMany({ where: { wallet: { userId: fx.sellerUserId } } })
        .catch(() => {});
      await prisma.wallet
        .deleteMany({ where: { userId: fx.sellerUserId } })
        .catch(() => {});
      await prisma.loyaltyTransaction
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });
});

describe("confirmPayment — cannot confirm a cancelled order", () => {
  it("an expired/cancelled order stays cancelled", async () => {
    const fx = await makeFixture({ price: 50, commissionRate: 0.1 });
    try {
      // A prepaid order left PENDING with a PENDING payment.
      const order = await prisma.order.create({
        data: {
          buyer: { connect: { id: fx.buyerId } },
          address: { connect: { id: fx.addressId } },
          status: "PENDING",
          paymentMethod: "BANK_TRANSFER",
          itemsTotal: 50,
          shippingTotal: 0,
          grandTotal: 50,
          displayCurrency: "USD",
          exchangeRate: 1,
          displayTotal: 50,
          subOrders: {
            create: [
              {
                store: { connect: { id: fx.storeId } },
                status: "PENDING",
                itemsTotal: 50,
                shippingTotal: 0,
                commissionRate: 0.1,
                items: {
                  create: [
                    {
                      variantId: fx.variantId,
                      titleSnapshot: "Test Product",
                      skuSnapshot: fx.variantSku,
                      unitPrice: 50,
                      quantity: 1,
                      lineTotal: 50,
                    },
                  ],
                },
              },
            ],
          },
          payment: {
            create: {
              method: "BANK_TRANSFER",
              status: "PENDING",
              amountUsd: 50,
            },
          },
        },
        include: { payment: true },
      });

      // Simulate expiry: the order is cancelled before the admin confirms.
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });

      as(adminId);
      const res = await confirmPayment(order.payment!.id);
      expect(res.error).toBe("badState");

      // The order must NOT be resurrected to CONFIRMED, and the payment stays unconfirmed.
      const after = await prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true, payment: { select: { status: true } } },
      });
      expect(after?.status).toBe("CANCELLED");
      expect(after?.payment?.status).not.toBe("CONFIRMED");
    } finally {
      await fx.cleanup();
    }
  });
});

describe("seller cancelSubOrder — a paid buyer is refunded, not left short", () => {
  it("wallet-paid: refunds to the wallet, marks REFUNDED, restores stock", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "HEZALLI_BALANCE",
        status: "CONFIRMED",
      });
      const before = await prisma.productVariant.findUnique({
        where: { id: fx.variantId },
        select: { stock: true },
      });

      as(fx.sellerUserId);
      const res = await cancelSubOrder(subOrderId, "out of stock");
      expect(res.ok).toBe(true);

      // Buyer made whole in their wallet.
      const { balance } = await getWalletView(fx.buyerId);
      expect(balance).toBe(100);

      // Sub-order is refunded and its stock is returned.
      const sub = await prisma.subOrder.findUnique({
        where: { id: subOrderId },
        select: { status: true },
      });
      expect(sub?.status).toBe("REFUNDED");
      const after = await prisma.productVariant.findUnique({
        where: { id: fx.variantId },
        select: { stock: true },
      });
      expect(after!.stock).toBe(before!.stock + 1);
    } finally {
      await prisma.walletEntry
        .deleteMany({ where: { wallet: { userId: fx.buyerId } } })
        .catch(() => {});
      await prisma.wallet
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await prisma.loyaltyTransaction
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });

  it("COD: plain cancel with no wallet movement", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "COD",
        status: "CONFIRMED",
      });

      as(fx.sellerUserId);
      const res = await cancelSubOrder(subOrderId, "out of stock");
      expect(res.ok).toBe(true);

      const sub = await prisma.subOrder.findUnique({
        where: { id: subOrderId },
        select: { status: true },
      });
      expect(sub?.status).toBe("CANCELLED");

      // No refund/wallet entry was created for a COD order.
      const entries = await prisma.walletEntry.findMany({
        where: { wallet: { userId: fx.buyerId } },
      });
      expect(entries).toHaveLength(0);
    } finally {
      await prisma.wallet
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });
});

describe("wallet withdrawal — a rejected withdrawal cannot then be paid", () => {
  it("rejects → returns funds once; a later pay attempt is refused", async () => {
    const fx = await makeFixture();
    try {
      const walletId = await getWalletId(fx.buyerId);
      // Fund the wallet, then reserve a withdrawal (CASHOUT debit) as the flow does.
      const withdrawal = await prisma.$transaction(async (tx) => {
        await creditWalletTx(tx, walletId, { type: "TOP_UP", amountUsd: 100 });
        const w = await tx.walletWithdrawal.create({
          data: {
            walletId,
            amountUsd: 40,
            method: "bank",
            destination: {},
            status: "REQUESTED",
          },
        });
        await creditWalletTx(tx, walletId, {
          type: "CASHOUT",
          amountUsd: -40,
          refType: "withdrawal",
          refId: w.id,
        });
        return w;
      });

      as(adminId);
      const rej = await rejectWithdrawal(withdrawal.id, "no proof");
      expect(rej.ok).toBe(true);

      // Funds returned exactly once → balance back to 100.
      expect((await getWalletView(fx.buyerId)).balance).toBe(100);

      // Paying the now-rejected withdrawal must be refused (else the user is paid twice).
      const pay = await markWithdrawalPaid(withdrawal.id, "ref");
      expect(pay.error).toBe("badState");
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
