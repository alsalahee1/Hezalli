-- Buyer's optional scheduled delivery window for Hezalli Express parcels: a
-- preferred day + a time-of-day slot. Both set together or both NULL.
ALTER TABLE "Order" ADD COLUMN "deliveryDate" DATE;
ALTER TABLE "Order" ADD COLUMN "deliverySlot" TEXT;
