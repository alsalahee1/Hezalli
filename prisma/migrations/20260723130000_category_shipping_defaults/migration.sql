-- Category-level delivery defaults: typical unit weight/size for products in
-- a category, used by capacity-aware dispatch when a product doesn't carry its
-- own weightGrams/dimensions (lib/courier-capacity.ts). This makes capacity
-- checks effective for the categories that matter (furniture, appliances)
-- without waiting for every seller to measure every product.
ALTER TABLE "Category" ADD COLUMN "defaultWeightGrams" INTEGER;
ALTER TABLE "Category" ADD COLUMN "defaultDimensions" JSONB;
