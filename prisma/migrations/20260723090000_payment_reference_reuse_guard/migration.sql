-- Fraud guard: a payment proof (bank/rail transfer reference or USDT tx hash)
-- can be used for exactly one order payment and one wallet top-up. Without
-- these, the same receipt could be submitted for multiple orders/top-ups and
-- only manual admin review would catch it. Expression indexes on lower(...)
-- so case variations of the same hash/reference still collide. Postgres
-- treats NULLs as distinct, so rows without a proof are unaffected.

-- De-duplicate existing rows first (keeps the oldest, clears later copies) so
-- the unique indexes can build on databases that already contain reused refs.
UPDATE "Payment" p SET "reference" = NULL
WHERE p."reference" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "Payment" q
  WHERE q."reference" IS NOT NULL
    AND lower(q."reference") = lower(p."reference")
    AND q."createdAt" < p."createdAt"
);
UPDATE "Payment" p SET "usdtTxHash" = NULL
WHERE p."usdtTxHash" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "Payment" q
  WHERE q."usdtTxHash" IS NOT NULL
    AND lower(q."usdtTxHash") = lower(p."usdtTxHash")
    AND q."createdAt" < p."createdAt"
);
UPDATE "WalletTopUp" p SET "reference" = NULL
WHERE p."reference" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "WalletTopUp" q
  WHERE q."reference" IS NOT NULL
    AND lower(q."reference") = lower(p."reference")
    AND q."createdAt" < p."createdAt"
);
UPDATE "WalletTopUp" p SET "usdtTxHash" = NULL
WHERE p."usdtTxHash" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "WalletTopUp" q
  WHERE q."usdtTxHash" IS NOT NULL
    AND lower(q."usdtTxHash") = lower(p."usdtTxHash")
    AND q."createdAt" < p."createdAt"
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_unique_ci"
  ON "Payment" (lower("reference"));

-- CreateIndex
CREATE UNIQUE INDEX "Payment_usdtTxHash_unique_ci"
  ON "Payment" (lower("usdtTxHash"));

-- CreateIndex
CREATE UNIQUE INDEX "WalletTopUp_reference_unique_ci"
  ON "WalletTopUp" (lower("reference"));

-- CreateIndex
CREATE UNIQUE INDEX "WalletTopUp_usdtTxHash_unique_ci"
  ON "WalletTopUp" (lower("usdtTxHash"));
