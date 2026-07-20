-- Bill payment & airtime top-up framework (Step 19.7).

-- New wallet ledger entry types.
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'BILL_PAYMENT';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'AIRTIME_TOPUP';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'BILL_REFUND';

-- Purchase kind + lifecycle enums.
CREATE TYPE "WalletBillKind" AS ENUM ('BILL', 'AIRTIME');
CREATE TYPE "WalletBillStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- Purchase record: wallet debited on create (PENDING), admin fulfills/fails.
CREATE TABLE "WalletBillPayment" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "kind" "WalletBillKind" NOT NULL,
    "biller" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "status" "WalletBillStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reference" TEXT,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletBillPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletBillPayment_walletId_idx" ON "WalletBillPayment"("walletId");
CREATE INDEX "WalletBillPayment_status_idx" ON "WalletBillPayment"("status");
CREATE INDEX "WalletBillPayment_kind_idx" ON "WalletBillPayment"("kind");

ALTER TABLE "WalletBillPayment"
    ADD CONSTRAINT "WalletBillPayment_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
