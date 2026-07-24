-- Usefulness counters for FAQ entries: how often a real shopper question
-- matched this answer, and when it last did. Bumped fire-and-forget after a
-- turn so admins can see which entries actually get triggered.
ALTER TABLE "AiFaq" ADD COLUMN IF NOT EXISTS "hitCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiFaq" ADD COLUMN IF NOT EXISTS "lastHitAt" TIMESTAMP(3);
