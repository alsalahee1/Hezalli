-- Point payout requests (docs/DELIVERY-POINTS.md §22).
CREATE TABLE IF NOT EXISTS "PointPayoutRequest" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointPayoutRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PointPayoutRequest_pointId_idx" ON "PointPayoutRequest"("pointId");
CREATE INDEX IF NOT EXISTS "PointPayoutRequest_status_idx" ON "PointPayoutRequest"("status");

ALTER TABLE "PointPayoutRequest" ADD CONSTRAINT "PointPayoutRequest_pointId_fkey"
  FOREIGN KEY ("pointId") REFERENCES "DeliveryPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
