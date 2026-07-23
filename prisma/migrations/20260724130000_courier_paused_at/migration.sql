-- Driver vacation mode: while set, the courier receives no automatic
-- assignments, offers, board pings, or board claims; manual dispatch still
-- works and in-flight jobs stay theirs.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "courierPausedAt" TIMESTAMP(3);
