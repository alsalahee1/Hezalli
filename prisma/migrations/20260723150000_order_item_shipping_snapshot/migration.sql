-- Shipping snapshot at checkout: freeze each order line's product weight and
-- dimensions the way titleSnapshot freezes the title, so in-flight parcel
-- capacity metrics (lib/courier-capacity.ts) don't shift when a seller edits
-- the catalog mid-delivery.
ALTER TABLE "OrderItem" ADD COLUMN "weightGramsSnapshot" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "dimensionsSnapshot" JSONB;

-- Backfill existing lines from the catalog as it stands today — the best
-- available approximation of what it said at checkout. Lines whose variant is
-- gone stay NULL and keep using the live-fallback path.
UPDATE "OrderItem" oi
SET "weightGramsSnapshot" = p."weightGrams",
    "dimensionsSnapshot"  = p."dimensions"
FROM "ProductVariant" v
JOIN "Product" p ON p."id" = v."productId"
WHERE v."id" = oi."variantId";
