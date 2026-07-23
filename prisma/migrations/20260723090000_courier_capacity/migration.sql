-- Capacity-aware courier assignment: the vehicle a driver was approved with is
-- copied onto their account so auto-assignment can match parcel weight and
-- parcel count to what the vehicle can actually carry (lib/courier-capacity.ts).
ALTER TABLE "User" ADD COLUMN "courierVehicleType" TEXT;

-- Backfill from already-approved applications so existing drivers immediately
-- get the capacity rules their vehicle implies. Couriers with no application
-- (manually granted) stay NULL = unconstrained, same as before this change.
UPDATE "User" u
SET "courierVehicleType" = ca."vehicleType"
FROM "CourierApplication" ca
WHERE ca."userId" = u."id"
  AND ca."status" = 'APPROVED';
