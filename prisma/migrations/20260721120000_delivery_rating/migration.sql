-- Buyer ratings of Hezalli Express couriers (one per shipment).

CREATE TABLE "DeliveryRating" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryRating_shipmentId_key" ON "DeliveryRating"("shipmentId");
CREATE INDEX "DeliveryRating_courierId_idx" ON "DeliveryRating"("courierId");

ALTER TABLE "DeliveryRating" ADD CONSTRAINT "DeliveryRating_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
