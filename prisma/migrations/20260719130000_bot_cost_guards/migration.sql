-- AlterTable
ALTER TABLE "BotConversation"
  ADD COLUMN "rateHits" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "msgCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tokensIn" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tokensOut" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BotDailyUsage" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotDailyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotDailyUsage_day_key" ON "BotDailyUsage"("day");
