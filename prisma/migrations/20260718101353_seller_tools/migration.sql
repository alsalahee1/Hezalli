-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "autoReplyMessage" TEXT,
ADD COLUMN     "isOnVacation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vacationMessage" TEXT;

