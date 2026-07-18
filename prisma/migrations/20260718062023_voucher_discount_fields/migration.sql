-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "maxDiscountUsd" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "SubOrder" ADD COLUMN     "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
