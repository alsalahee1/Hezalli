-- Standard package sizes (envelope | small | medium | large | xlarge |
-- oversized): the seller-friendly capacity input, mapped to representative
-- weight/dimensions in lib/courier-capacity.ts. xlarge/oversized are freight —
-- direct seller→buyer only, delivery appointment required.
ALTER TABLE "Product" ADD COLUMN "sizeClass" TEXT;
ALTER TABLE "Category" ADD COLUMN "defaultSizeClass" TEXT;
-- Frozen at checkout alongside the weight/dimensions snapshots so freight
-- rules on in-flight parcels don't shift when the catalog changes.
ALTER TABLE "OrderItem" ADD COLUMN "sizeClassSnapshot" TEXT;
