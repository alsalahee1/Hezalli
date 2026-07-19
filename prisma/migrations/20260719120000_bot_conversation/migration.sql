-- CreateTable
CREATE TABLE "BotConversation" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotConversation_platform_chatId_key" ON "BotConversation"("platform", "chatId");

-- CreateIndex
CREATE INDEX "BotConversation_updatedAt_idx" ON "BotConversation"("updatedAt");
