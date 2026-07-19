-- Courier live location for locality-based dispatch (one row per driver).

-- CreateTable
CREATE TABLE "CourierLocation" (
    "userId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "governorate" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierLocation_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "CourierLocation_governorate_idx" ON "CourierLocation"("governorate");

-- AddForeignKey
ALTER TABLE "CourierLocation" ADD CONSTRAINT "CourierLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
