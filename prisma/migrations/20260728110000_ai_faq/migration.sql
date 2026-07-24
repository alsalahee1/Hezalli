-- Curated Q&A the assistant uses as its knowledge base. Admins add entries
-- (often from a "needs attention" question) so the characters answer known
-- questions consistently instead of falling back to the generic reply.
CREATE TABLE "AiFaq" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "bot" TEXT NOT NULL DEFAULT 'all',
    "locale" TEXT NOT NULL DEFAULT 'all',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFaq_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiFaq_enabled_updatedAt_idx" ON "AiFaq"("enabled", "updatedAt");
