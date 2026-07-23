-- Repeat reminders for unclaimed board jobs (docs/EXPRESS-DELIVERY.md §4b):
-- when couriers were last re-pinged about this parcel sitting on the board,
-- so the sweep reminds once per board_reminder_minutes, not once per run.

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "boardRemindedAt" TIMESTAMP(3);
