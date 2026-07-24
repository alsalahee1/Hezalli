-- Zone-aware shelf placement (docs §42e): tag each bay with what it serves so
-- the receive scan routes buyer PICKUP parcels near the counter, courier
-- DISPATCH loads near the door, and RETURNS to their own area. Null = general.
CREATE TYPE "PointShelfZone" AS ENUM ('PICKUP', 'DISPATCH', 'RETURNS');

ALTER TABLE "PointShelf" ADD COLUMN "zone" "PointShelfZone";
