-- COD credit control v1.15 (docs §32): optional security deposits that raise
-- the holder's cash limit 1:1. Admin-set only, changes audited.
ALTER TABLE "User" ADD COLUMN "courierDepositUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryPoint" ADD COLUMN "depositUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;
