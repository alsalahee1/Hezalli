-- Transaction detail + shareable receipts (Step 19.8).

-- Link an entry to its source record so the detail/receipt can enrich it.
ALTER TABLE "WalletEntry" ADD COLUMN "refType" TEXT;
ALTER TABLE "WalletEntry" ADD COLUMN "refId" TEXT;

-- Unguessable token for the public receipt page (minted on first share).
ALTER TABLE "WalletEntry" ADD COLUMN "receiptToken" TEXT;
CREATE UNIQUE INDEX "WalletEntry_receiptToken_key" ON "WalletEntry"("receiptToken");
