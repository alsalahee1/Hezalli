-- Per-zone exchange rates: Yemen's rial circulates at two very different
-- values (old-rial areas around Sana'a vs. the floating rial around Aden), so
-- a single national rate per currency cannot price both regions. Rates are now
-- unique per (currency, zone); existing rows become the "DEFAULT" zone, which
-- stays the fallback when no zone-specific row exists.
ALTER TABLE "ExchangeRate" ADD COLUMN "zone" TEXT NOT NULL DEFAULT 'DEFAULT';

DROP INDEX "ExchangeRate_currency_key";

CREATE UNIQUE INDEX "ExchangeRate_currency_zone_key" ON "ExchangeRate"("currency", "zone");
