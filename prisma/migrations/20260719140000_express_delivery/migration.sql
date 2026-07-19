-- Express delivery tier: a per-store-group STANDARD/EXPRESS choice at checkout,
-- an optional per-zone express fee, and the chosen tier recorded on the sub-order.

-- CreateEnum
CREATE TYPE "ShippingMethod" AS ENUM ('STANDARD', 'EXPRESS');

-- AlterTable: record the buyer's chosen delivery tier per sub-order
ALTER TABLE "SubOrder" ADD COLUMN "shippingMethod" "ShippingMethod" NOT NULL DEFAULT 'STANDARD';

-- AlterTable: optional per-zone express fee (null → platform default express fee)
ALTER TABLE "ShippingRate" ADD COLUMN "expressFeeUsd" DECIMAL(12,2);
