-- Driver job offers (docs/EXPRESS-DELIVERY.md): auto-assignment offers a
-- parcel to a courier instead of forcing it — accept / decline / expire, with
-- a cascade to the next courier and a one-shot dispatch escalation.

-- CreateEnum
CREATE TYPE "ShipmentOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "assignmentEscalatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ShipmentOffer" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "ShipmentOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentOffer_shipmentId_driverId_key" ON "ShipmentOffer"("shipmentId", "driverId");

-- CreateIndex
CREATE INDEX "ShipmentOffer_driverId_status_idx" ON "ShipmentOffer"("driverId", "status");

-- CreateIndex
CREATE INDEX "ShipmentOffer_status_expiresAt_idx" ON "ShipmentOffer"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "ShipmentOffer" ADD CONSTRAINT "ShipmentOffer_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
