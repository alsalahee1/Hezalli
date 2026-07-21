-- Inter-point line-haul (docs/DELIVERY-POINTS.md §14).

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "originPointId" TEXT;

-- CreateIndex
CREATE INDEX "Shipment_originPointId_idx" ON "Shipment"("originPointId");
