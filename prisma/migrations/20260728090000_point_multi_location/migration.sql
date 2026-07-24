-- Multi-location (docs §42j): an owner may run several branches, so ownerId is
-- no longer unique. Drop the unique index and replace it with a plain index.
DROP INDEX IF EXISTS "DeliveryPoint_ownerId_key";

CREATE INDEX IF NOT EXISTS "DeliveryPoint_ownerId_idx" ON "DeliveryPoint"("ownerId");
