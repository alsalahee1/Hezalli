-- One-shot guard for the stuck-shipment alert sweep.
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "stuckFlaggedAt" TIMESTAMP(3);
