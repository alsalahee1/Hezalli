-- Step 19.5+: sweep seller earnings into the HezalliPay wallet. Bridges the two
-- ledgers (a WALLET_TRANSFER debit on the seller balance + a SELLER_EARNINGS
-- credit on the wallet); no refactor of either.

-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'WALLET_TRANSFER';

-- AlterEnum
ALTER TYPE "WalletEntryType" ADD VALUE 'SELLER_EARNINGS';
