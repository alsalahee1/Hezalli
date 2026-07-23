import { describe, expect, it } from "vitest";

import { settleSubOrder } from "@/lib/finance";
import { applyRefund } from "@/lib/refunds";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

describe("settleSubOrder (prepaid)", () => {
  it("writes one SALE entry of items+shipping−commission and is idempotent", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
      });
      await settleSubOrder(subOrderId);

      const entries = await prisma.ledgerEntry.findMany({
        where: { subOrderId },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("SALE");
      expect(Number(entries[0].amountUsd)).toBe(90); // 100 − 10 commission

      // second call must not double-credit
      await settleSubOrder(subOrderId);
      expect(await prisma.ledgerEntry.count({ where: { subOrderId } })).toBe(1);

      const bal = await prisma.sellerBalance.findUnique({
        where: { sellerId: fx.sellerProfileId },
      });
      expect(Number(bal!.availableUsd)).toBe(90);
    } finally {
      await fx.cleanup();
    }
  });

  it("honours a per-seller commission rate", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.05 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
      });
      await settleSubOrder(subOrderId);
      const entry = await prisma.ledgerEntry.findFirst({
        where: { subOrderId },
      });
      expect(Number(entry!.amountUsd)).toBe(95); // 100 − 5% commission
    } finally {
      await fx.cleanup();
    }
  });
});

describe("settleSubOrder (COD)", () => {
  it("charges only the commission as a negative ledger entry", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({ paymentMethod: "COD" });
      await settleSubOrder(subOrderId);
      const entries = await prisma.ledgerEntry.findMany({
        where: { subOrderId },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("COD_COMMISSION_DUE");
      expect(Number(entries[0].amountUsd)).toBe(-10);
    } finally {
      await fx.cleanup();
    }
  });
});

describe("applyRefund", () => {
  it("reverses the SALE credit, nets the ledger to zero, marks REFUNDED", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
      });
      await settleSubOrder(subOrderId);

      const res = await applyRefund(subOrderId, {
        reason: "test",
        actor: "admin",
      });
      expect(res.ok).toBe(true);
      expect(res.amount).toBe(100); // buyer paid 100

      const sub = await prisma.subOrder.findUnique({
        where: { id: subOrderId },
      });
      expect(sub!.status).toBe("REFUNDED");

      const entries = await prisma.ledgerEntry.findMany({
        where: { subOrderId },
      });
      const net = entries.reduce((s, e) => s + Number(e.amountUsd), 0);
      expect(Math.round(net * 100) / 100).toBe(0);

      const bal = await prisma.sellerBalance.findUnique({
        where: { sellerId: fx.sellerProfileId },
      });
      expect(Number(bal!.availableUsd)).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });

  it("rejects a second refund on the same sub-order", async () => {
    const fx = await makeFixture();
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
      });
      await settleSubOrder(subOrderId);
      await applyRefund(subOrderId, { reason: "t", actor: "admin" });
      const second = await applyRefund(subOrderId, {
        reason: "t",
        actor: "admin",
      });
      expect(second.error).toBe("badState");
    } finally {
      await fx.cleanup();
    }
  });

  it("refuses to refund a CANCELLED sub-order (buyer-cancel double-refund guard)", async () => {
    // The buyer-cancel path already refunds a wallet order and marks the
    // sub-order CANCELLED without writing a Refund row, so an admin refund on
    // top would double-pay. CANCELLED must be treated as terminal.
    const fx = await makeFixture();
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "HEZALLI_BALANCE",
        status: "CANCELLED",
      });
      const res = await applyRefund(subOrderId, {
        reason: "t",
        actor: "admin",
      });
      expect(res.error).toBe("badState");
    } finally {
      await fx.cleanup();
    }
  });

  it("refuses to refund when the order payment is already REFUNDED", async () => {
    const fx = await makeFixture();
    try {
      const { subOrderId, orderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
      });
      await prisma.payment.updateMany({
        where: { orderId },
        data: { status: "REFUNDED" },
      });
      const res = await applyRefund(subOrderId, {
        reason: "t",
        actor: "admin",
      });
      expect(res.error).toBe("badState");
    } finally {
      await fx.cleanup();
    }
  });
});
