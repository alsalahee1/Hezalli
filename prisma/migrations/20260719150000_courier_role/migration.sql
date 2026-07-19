-- Hezalli Express couriers: a COURIER role + a driver assignment on shipments.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COURIER';

-- AlterTable: assigned delivery driver (null = unassigned / third-party carrier)
ALTER TABLE "Shipment" ADD COLUMN "driverId" TEXT;

-- CreateIndex
CREATE INDEX "Shipment_driverId_idx" ON "Shipment"("driverId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
