-- Full-text search index for the storefront listing/search (audit §4.2).
--
-- The search predicate previously mixed Product columns with a joined Brand name,
-- which no single-table expression index can cover. lib/search.ts now matches the
-- Product-only tsvector (indexed here) and unions in brand-name matches separately,
-- so this GIN index actually gets used instead of sequentially scanning + building
-- a tsvector for every ACTIVE product on each keystroke.
--
-- The two-arg to_tsvector('simple', …) form with a constant config is IMMUTABLE,
-- as are the ->> JSON accessor, coalesce, and ||, so the expression is indexable.
CREATE INDEX "Product_fts_idx" ON "Product" USING GIN (
  to_tsvector(
    'simple',
    coalesce("title"->>'en', '') || ' ' || coalesce("title"->>'ar', '') || ' ' ||
    coalesce("description"->>'en', '') || ' ' || coalesce("description"->>'ar', '')
  )
);
