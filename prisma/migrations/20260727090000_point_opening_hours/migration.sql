-- Weekly opening hours for a hub (docs §42g): a 7-slot JSON array of
-- { open, close } "HH:MM" Asia/Aden times or null per day. A display/discovery
-- aid, separate from the vacation pause that stops routing.
ALTER TABLE "DeliveryPoint" ADD COLUMN IF NOT EXISTS "openingHours" JSONB;
