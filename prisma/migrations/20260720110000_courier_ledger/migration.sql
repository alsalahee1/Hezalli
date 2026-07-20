-- Courier cash + earnings ledger for Hezalli Express COD reconciliation.

-- CreateEnum
CREATE TYPE "CourierLedgerType" AS ENUM ('COD_COLLECTED', 'REMITTANCE', 'EARNING', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "CourierLedgerEntry" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "type" "CourierLedgerType" NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "subOrderId" TEXT,
    "shipmentId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourierLedgerEntry_courierId_idx" ON "CourierLedgerEntry"("courierId");

-- CreateIndex
CREATE INDEX "CourierLedgerEntry_subOrderId_idx" ON "CourierLedgerEntry"("subOrderId");

-- AddForeignKey
ALTER TABLE "CourierLedgerEntry" ADD CONSTRAINT "CourierLedgerEntry_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
