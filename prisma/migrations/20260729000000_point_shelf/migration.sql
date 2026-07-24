-- Per-point shelf registry (docs §42e): registering bays lets the counter
-- auto-place received parcels on the least-busy shelf. Occupancy is derived
-- live from Shipment.shelfCode, so nothing here tracks counts.
CREATE TABLE "PointShelf" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointShelf_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PointShelf_pointId_code_key" ON "PointShelf"("pointId", "code");

CREATE INDEX "PointShelf_pointId_idx" ON "PointShelf"("pointId");

ALTER TABLE "PointShelf" ADD CONSTRAINT "PointShelf_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "DeliveryPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
