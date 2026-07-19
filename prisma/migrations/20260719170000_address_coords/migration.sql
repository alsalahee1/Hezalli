-- Optional pinned coordinates on addresses for proximity-based courier routing.
ALTER TABLE "Address" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Address" ADD COLUMN "lng" DOUBLE PRECISION;
