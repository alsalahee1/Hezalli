-- Delivery-ops team desks. The DELIVERY_MANAGER role stays the entry
-- credential to /delivery-manager; deliveryScopes narrows which desks a member
-- may work. Empty array = Head of Delivery (all desks) — so every existing
-- DELIVERY_MANAGER account keeps full access with no data backfill.
CREATE TYPE "DeliveryScope" AS ENUM ('DISPATCH', 'FLEET', 'POINTS', 'SETTLEMENT', 'NETWORK');

ALTER TABLE "User" ADD COLUMN "deliveryScopes" "DeliveryScope"[] DEFAULT ARRAY[]::"DeliveryScope"[];
