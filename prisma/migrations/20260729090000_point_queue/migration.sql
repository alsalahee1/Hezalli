-- Hub arrival queue & drop-off/collection slots (docs §44). Spreads the
-- morning crowd: a reservable time slot flattens the peak, and a fair
-- arrival-ordered ticket number removes the "who's first" scrum at the desk.
-- Scoped to an Asia/Aden service day so numbering resets each morning.
CREATE TYPE "PointQueueKind" AS ENUM ('DROPOFF', 'COLLECTION');

CREATE TYPE "PointQueueStatus" AS ENUM ('BOOKED', 'WAITING', 'SERVING', 'DONE', 'CANCELLED', 'NO_SHOW');

CREATE TABLE "PointQueueEntry" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PointQueueKind" NOT NULL,
    "status" "PointQueueStatus" NOT NULL DEFAULT 'WAITING',
    "serviceDay" TEXT NOT NULL,
    "slotStart" INTEGER,
    "ticketNo" INTEGER,
    "parcelCount" INTEGER,
    "note" TEXT,
    "bookedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "calledAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointQueueEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PointQueueEntry_pointId_serviceDay_status_idx" ON "PointQueueEntry"("pointId", "serviceDay", "status");

CREATE INDEX "PointQueueEntry_userId_status_idx" ON "PointQueueEntry"("userId", "status");

ALTER TABLE "PointQueueEntry" ADD CONSTRAINT "PointQueueEntry_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "DeliveryPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PointQueueEntry" ADD CONSTRAINT "PointQueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
