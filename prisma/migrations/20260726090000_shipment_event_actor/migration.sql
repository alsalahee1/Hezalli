-- Per-staff accountability (docs §42e): record which user performed a custody
-- scan at a hub counter, so the owner can see who received / handed over /
-- picked up each parcel. Null for automatic transitions and courier-side
-- events.
ALTER TABLE "ShipmentEvent" ADD COLUMN IF NOT EXISTS "actorId" TEXT;

CREATE INDEX IF NOT EXISTS "ShipmentEvent_actorId_createdAt_idx" ON "ShipmentEvent"("actorId", "createdAt");
