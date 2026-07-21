-- Fleet-partner tier: a delivery company grouping several Hezalli Express
-- couriers. Couriers link via User.fleetId; an optional owner gets a read-only
-- fleet portal.
CREATE TABLE "Fleet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "ownerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Fleet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Fleet_ownerId_key" ON "Fleet"("ownerId");
CREATE INDEX "Fleet_isActive_idx" ON "Fleet"("isActive");

ALTER TABLE "User" ADD COLUMN "fleetId" TEXT;
CREATE INDEX "User_fleetId_idx" ON "User"("fleetId");

ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
