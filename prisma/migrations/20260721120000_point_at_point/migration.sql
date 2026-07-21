-- Track which hub physically holds a parcel (docs §14).

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "atPointId" TEXT;

-- CreateIndex
CREATE INDEX "Shipment_atPointId_idx" ON "Shipment"("atPointId");
