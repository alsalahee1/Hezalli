-- Arrival-queue refinements (docs §45):
--  * per-hub slot booking cap (falls back to the global queue_slot_capacity
--    when null), so busy hubs allow more per slot and small shops fewer;
--  * a one-shot reminder timestamp for the approaching-slot nudge sweep.
ALTER TABLE "DeliveryPoint" ADD COLUMN IF NOT EXISTS "slotCapacity" INTEGER;

ALTER TABLE "PointQueueEntry" ADD COLUMN IF NOT EXISTS "remindedAt" TIMESTAMP(3);
