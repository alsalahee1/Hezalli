-- Shelf/bin location of a parcel inside the hub that holds it.
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "shelfCode" TEXT;
