-- Self-service: couriers and Hezalli Point operators sweep their accrued
-- earnings into their HezalliPay wallet. Each move writes a negative PAYOUT on
-- the courier/point ledger and a matching credit on the wallet; these are the
-- wallet-side entry types for that credit (mirrors SELLER_EARNINGS).

-- AlterEnum
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'COURIER_EARNINGS';

-- AlterEnum
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'POINT_EARNINGS';
