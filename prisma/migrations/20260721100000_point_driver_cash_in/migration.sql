-- Driver COD remittance via points (docs/DELIVERY-POINTS.md §12).

-- AlterEnum
ALTER TYPE "PointLedgerType" ADD VALUE IF NOT EXISTS 'DRIVER_CASH_IN';
