-- Seller ship-SLA sweep (docs/AUDIT-LIFECYCLE-2026-07-22.md GAP-3): one-shot
-- guard for the "ship soon or this cancels" warning to the seller.

-- AlterTable
ALTER TABLE "SubOrder" ADD COLUMN "sellerSlaRemindedAt" TIMESTAMP(3);
