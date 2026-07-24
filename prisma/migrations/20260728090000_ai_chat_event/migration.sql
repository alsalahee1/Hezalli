-- Per-character assistant analytics (Admin → Shadi stats). One row per turn:
-- which character answered, on which section/page, in what language, who asked
-- (signed-in user and/or anonymous visitor cookie), and the question text so
-- the most-asked questions can be surfaced. Best-effort, written after a reply.
CREATE TABLE "AiChatEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bot" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "userId" TEXT,
    "visitorId" TEXT,
    "question" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiChatEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiChatEvent_bot_createdAt_idx" ON "AiChatEvent"("bot", "createdAt");
CREATE INDEX "AiChatEvent_createdAt_idx" ON "AiChatEvent"("createdAt");
