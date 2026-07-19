-- AlterTable
ALTER TABLE "BotConversation"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "linkCode" TEXT,
  ADD COLUMN "linkCodeExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "BotConversation_linkCode_key" ON "BotConversation"("linkCode");

-- CreateIndex
CREATE INDEX "BotConversation_userId_idx" ON "BotConversation"("userId");
