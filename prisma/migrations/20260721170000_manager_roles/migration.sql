-- Staff roles for the scoped wallet + delivery dashboards.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'WALLET_MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DELIVERY_MANAGER';
