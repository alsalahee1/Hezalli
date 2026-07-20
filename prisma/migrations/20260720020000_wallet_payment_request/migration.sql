-- Step 19.6: "request money" — a user requests payment, another pays from wallet.

-- CreateEnum
CREATE TYPE "WalletRequestStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "WalletPaymentRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "status" "WalletRequestStatus" NOT NULL DEFAULT 'PENDING',
    "payerId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletPaymentRequest_requesterId_idx" ON "WalletPaymentRequest"("requesterId");

-- CreateIndex
CREATE INDEX "WalletPaymentRequest_status_idx" ON "WalletPaymentRequest"("status");
