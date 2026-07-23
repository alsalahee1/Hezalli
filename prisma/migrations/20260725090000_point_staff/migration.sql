-- Point staff: extra counter accounts a hub attaches to itself (store
-- manager, cashier, money collector, shelves organizer — docs §42d).
-- Membership is the grant: staff do NOT hold the DELIVERY_POINT role, and one
-- user works at one hub at a time (userId unique).
CREATE TYPE "PointStaffRole" AS ENUM ('MANAGER', 'CASHIER', 'COLLECTOR', 'ORGANIZER');

CREATE TABLE "PointStaff" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PointStaffRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointStaff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PointStaff_userId_key" ON "PointStaff"("userId");

CREATE INDEX "PointStaff_pointId_idx" ON "PointStaff"("pointId");

ALTER TABLE "PointStaff" ADD CONSTRAINT "PointStaff_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "DeliveryPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PointStaff" ADD CONSTRAINT "PointStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
