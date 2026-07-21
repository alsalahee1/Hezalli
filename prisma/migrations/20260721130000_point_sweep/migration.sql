-- Stale-parcel sweep one-shot guards (docs/DELIVERY-POINTS.md §20).
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "pickupRemindedAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "staleFlaggedAt" TIMESTAMP(3);
