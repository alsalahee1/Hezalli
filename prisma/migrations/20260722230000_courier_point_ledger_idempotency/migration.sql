-- Idempotency backstop for courier + delivery-point earnings/COD ledgers.
--
-- The delivery transition (lib/shipment-core.ts) now claims SHIPPED→DELIVERED
-- atomically, so one delivery can no longer mint duplicate accrual rows. These
-- partial unique indexes are belt-and-suspenders: any future code path that
-- re-runs a delivery's ledger writes fails with a unique violation instead of
-- silently double-crediting a courier/point.
--
-- Scoping notes:
--   * Courier accruals are keyed by (courierId, subOrderId): exactly one EARNING
--     and one COD_COLLECTED per courier per sub-order — this catches the
--     double-submit (same driver, same parcel) without blocking a hypothetical
--     re-delivery by a different driver.
--   * Point accruals are keyed by (pointId, subOrderId): a two-hop parcel
--     legitimately earns a HANDLING_FEE at BOTH the origin and destination hub
--     (different pointId, same sub-order), so uniqueness must include pointId.
--
-- Partial unique indexes are not expressible in the Prisma schema DSL, so they
-- live here as raw SQL (same approach as 20260720120004_money_guards_*).
--
-- NOTE: if a pre-existing database already holds duplicate accrual rows from the
-- race this guards, dedupe them before applying (fresh/test databases have none).

-- At most one EARNING per (courier, sub-order).
CREATE UNIQUE INDEX "CourierLedgerEntry_earning_key"
  ON "CourierLedgerEntry" ("courierId", "subOrderId")
  WHERE "type" = 'EARNING' AND "subOrderId" IS NOT NULL;

-- At most one COD_COLLECTED per (courier, sub-order).
CREATE UNIQUE INDEX "CourierLedgerEntry_cod_collected_key"
  ON "CourierLedgerEntry" ("courierId", "subOrderId")
  WHERE "type" = 'COD_COLLECTED' AND "subOrderId" IS NOT NULL;

-- At most one HANDLING_FEE per (point, sub-order).
CREATE UNIQUE INDEX "DeliveryPointLedgerEntry_handling_key"
  ON "DeliveryPointLedgerEntry" ("pointId", "subOrderId")
  WHERE "type" = 'HANDLING_FEE' AND "subOrderId" IS NOT NULL;

-- At most one counter COD_COLLECTED per (point, sub-order).
CREATE UNIQUE INDEX "DeliveryPointLedgerEntry_cod_collected_key"
  ON "DeliveryPointLedgerEntry" ("pointId", "subOrderId")
  WHERE "type" = 'COD_COLLECTED' AND "subOrderId" IS NOT NULL;
