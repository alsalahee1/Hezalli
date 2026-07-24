-- Mark turns where the character couldn't answer (returned the generic
-- fallback), so the stats page can show a "needs attention" rate and the
-- specific questions that fell back.
ALTER TABLE "AiChatEvent" ADD COLUMN IF NOT EXISTS "fallback" BOOLEAN NOT NULL DEFAULT false;
