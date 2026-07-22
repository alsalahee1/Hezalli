-- Wallet COD hold v1.16 (docs §36): a courier voluntarily locks part of their
-- HezalliPay balance as collateral for COD cash. Outflows must keep
-- availableUsd >= codHoldUsd; the hold counts toward the COD cash limit.
ALTER TABLE "Wallet" ADD COLUMN "codHoldUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;
