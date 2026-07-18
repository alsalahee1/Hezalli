-- CreateEnum
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'USED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "condition" "ProductCondition" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "dimensions" JSONB,
ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weightGrams" INTEGER;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "compareAtPrice" DECIMAL(12,2);
