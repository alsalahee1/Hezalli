-- Buyer pickup from point (PUDO) + point counter cash (docs/DELIVERY-POINTS.md §6).

-- AlterEnum
ALTER TYPE "ShippingMethod" ADD VALUE IF NOT EXISTS 'PICKUP';

-- AlterEnum
ALTER TYPE "PointLedgerType" ADD VALUE IF NOT EXISTS 'COD_COLLECTED';
ALTER TYPE "PointLedgerType" ADD VALUE IF NOT EXISTS 'COD_REMITTANCE';

-- AlterTable
ALTER TABLE "SubOrder" ADD COLUMN "pickupPointId" TEXT;
