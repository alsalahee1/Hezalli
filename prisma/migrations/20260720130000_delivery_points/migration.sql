-- Hezalli Delivery Points: partner-operated parcel hubs (see docs/DELIVERY-POINTS.md).

-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DELIVERY_POINT';

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'AT_POINT' BEFORE 'OUT_FOR_DELIVERY';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'RETURNED_TO_POINT' BEFORE 'RETURNED';

-- CreateEnum
CREATE TYPE "DeliveryPointStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PointLedgerType" AS ENUM ('HANDLING_FEE', 'PAYOUT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "DeliveryPoint" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "governorate" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "status" "DeliveryPointStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPointApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pointName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "governorate" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "notes" TEXT,
    "status" "CourierApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPointApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPointLedgerEntry" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "type" "PointLedgerType" NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "subOrderId" TEXT,
    "shipmentId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPointLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "deliveryPointId" TEXT,
ADD COLUMN "deliveryCode" TEXT,
ADD COLUMN "redeliverAt" TIMESTAMP(3),
ADD COLUMN "redeliverNote" TEXT;

-- AlterTable
ALTER TABLE "DeliveryAttempt" ADD COLUMN "codeVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPoint_ownerId_key" ON "DeliveryPoint"("ownerId");

-- CreateIndex
CREATE INDEX "DeliveryPoint_governorate_status_idx" ON "DeliveryPoint"("governorate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPointApplication_userId_key" ON "DeliveryPointApplication"("userId");

-- CreateIndex
CREATE INDEX "DeliveryPointApplication_status_idx" ON "DeliveryPointApplication"("status");

-- CreateIndex
CREATE INDEX "DeliveryPointLedgerEntry_pointId_idx" ON "DeliveryPointLedgerEntry"("pointId");

-- CreateIndex
CREATE INDEX "DeliveryPointLedgerEntry_subOrderId_idx" ON "DeliveryPointLedgerEntry"("subOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_deliveryCode_key" ON "Shipment"("deliveryCode");

-- CreateIndex
CREATE INDEX "Shipment_deliveryPointId_idx" ON "Shipment"("deliveryPointId");

-- AddForeignKey
ALTER TABLE "DeliveryPoint" ADD CONSTRAINT "DeliveryPoint_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPointApplication" ADD CONSTRAINT "DeliveryPointApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPointLedgerEntry" ADD CONSTRAINT "DeliveryPointLedgerEntry_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "DeliveryPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_deliveryPointId_fkey" FOREIGN KEY ("deliveryPointId") REFERENCES "DeliveryPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
