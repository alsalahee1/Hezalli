-- Buyer's home governorate chosen at signup (optional). Drives the default
-- currency zone (which Yemeni rial prices display in) before the buyer has a
-- saved shipping address. Nullable; existing users keep address-derived zones.
ALTER TABLE "User" ADD COLUMN "homeGovernorate" TEXT;
