-- Open driver job board (docs/EXPRESS-DELIVERY.md §4b): when a platform parcel
-- is posted on the board, any eligible courier may claim it — first tap wins.
-- The timestamp also starts the board-only window before push-offers begin.

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "boardedAt" TIMESTAMP(3);
