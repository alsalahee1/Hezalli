-- Driver earnings payout: a negative ledger entry that settles fees owed.
ALTER TYPE "CourierLedgerType" ADD VALUE IF NOT EXISTS 'PAYOUT' BEFORE 'ADJUSTMENT';
