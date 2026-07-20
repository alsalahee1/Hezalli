-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "FlashSaleItem_variantId_idx" ON "FlashSaleItem"("variantId");

-- CreateIndex
CREATE INDEX "LedgerEntry_subOrderId_idx" ON "LedgerEntry"("subOrderId");

-- CreateIndex
CREATE INDEX "LedgerEntry_payoutId_idx" ON "LedgerEntry"("payoutId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_subOrderId_idx" ON "LoyaltyTransaction"("subOrderId");

-- CreateIndex
CREATE INDEX "Order_couponId_idx" ON "Order"("couponId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE INDEX "Refund_subOrderId_idx" ON "Refund"("subOrderId");

-- CreateIndex
CREATE INDEX "Shipment_carrierId_idx" ON "Shipment"("carrierId");

-- CreateIndex
CREATE INDEX "SubOrder_autoCompleteAt_idx" ON "SubOrder"("autoCompleteAt");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- CreateIndex
CREATE INDEX "WalletEntry_orderId_idx" ON "WalletEntry"("orderId");

-- CreateIndex
CREATE INDEX "WalletEntry_subOrderId_idx" ON "WalletEntry"("subOrderId");

-- Idempotency constraints (partial unique indexes — not expressible in the
-- Prisma schema DSL, so declared here as raw SQL). These make the "already
-- settled / already awarded / already credited" guards race-proof: a concurrent
-- second writer fails with a unique violation instead of double-crediting.
--
-- NOTE: if a pre-existing database already contains duplicates from the race
-- these fix, dedupe those rows before applying (fresh/test databases have none).

-- At most one settlement ledger entry (SALE or COD_COMMISSION_DUE) per sub-order.
CREATE UNIQUE INDEX "LedgerEntry_settlement_key"
  ON "LedgerEntry" ("subOrderId")
  WHERE "type" IN ('SALE', 'COD_COMMISSION_DUE');

-- At most one loyalty EARN transaction per sub-order.
CREATE UNIQUE INDEX "LoyaltyTransaction_earn_key"
  ON "LoyaltyTransaction" ("subOrderId")
  WHERE "type" = 'EARN';

-- At most one cashback wallet entry per (wallet, sub-order).
CREATE UNIQUE INDEX "WalletEntry_cashback_key"
  ON "WalletEntry" ("walletId", "subOrderId")
  WHERE "type" = 'CASHBACK';
