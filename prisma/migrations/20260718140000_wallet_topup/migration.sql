-- Step 19.3: wallet top-ups (cash-in over a rail, admin-confirmed).

-- CreateEnum
CREATE TYPE "WalletTopUpStatus" AS ENUM ('AWAITING_CONFIRMATION', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "WalletTopUp" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "status" "WalletTopUpStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "reference" TEXT,
    "usdtNetwork" "UsdtNetwork",
    "usdtTxHash" TEXT,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletTopUp_walletId_idx" ON "WalletTopUp"("walletId");

-- CreateIndex
CREATE INDEX "WalletTopUp_status_idx" ON "WalletTopUp"("status");

-- AddForeignKey
ALTER TABLE "WalletTopUp" ADD CONSTRAINT "WalletTopUp_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
