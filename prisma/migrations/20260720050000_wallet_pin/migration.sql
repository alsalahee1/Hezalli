-- Wallet PIN + brute-force lockout (Step 19.9).
ALTER TABLE "Wallet" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "Wallet" ADD COLUMN "pinFailedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
