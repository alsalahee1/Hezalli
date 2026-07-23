-- Hub vacation mode: while set, the point receives no new routing and is
-- hidden from the public directory; announced parcels are still accepted
-- and held parcels stay collectible.
ALTER TABLE "DeliveryPoint" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
