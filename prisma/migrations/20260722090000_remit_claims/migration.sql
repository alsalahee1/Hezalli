-- Digital COD remittance claims v1.18 (docs §38): a courier or point remits
-- held cash by rail transfer + reference; staff approval writes the ledger.
CREATE TYPE "RemitClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "RemitClaim" (
    "id" TEXT NOT NULL,
    "courierId" TEXT,
    "pointId" TEXT,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "RemitClaimStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RemitClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RemitClaim_status_idx" ON "RemitClaim"("status");
CREATE INDEX "RemitClaim_courierId_idx" ON "RemitClaim"("courierId");
CREATE INDEX "RemitClaim_pointId_idx" ON "RemitClaim"("pointId");

ALTER TABLE "RemitClaim" ADD CONSTRAINT "RemitClaim_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemitClaim" ADD CONSTRAINT "RemitClaim_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "DeliveryPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
