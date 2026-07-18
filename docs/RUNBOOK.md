# Hezalli — Operations Runbook

Practical operations reference: backups, deploys, migrations, and common
incident playbooks. Keep this current as infrastructure changes.

## Environments & configuration

Required environment variables (see `.env.example` for the full list):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (pooled URL in production). |
| `AUTH_SECRET` | Auth.js JWT signing secret. Generate with `openssl rand -base64 32`. |
| `AUTH_URL` / `AUTH_TRUST_HOST` | Canonical URL / trust-proxy for Auth.js. |

Secrets live only in the host's environment (Vercel/host dashboard) — never in
the repo. Only `.env.example` is committed.

## Database backups & restore

Hosted Postgres (Neon or Supabase) provides automated backups; confirm the
policy on the provider dashboard after provisioning:

- **Neon** — automatic continuous backups with point-in-time restore (PITR).
  Restore: create a branch from a past timestamp (Branches → Restore), verify,
  then repoint `DATABASE_URL`. Retention depends on plan (7 days on free).
- **Supabase** — daily automated backups (Database → Backups); Pro adds PITR.
  Restore: pick a backup/timestamp → Restore, then update `DATABASE_URL`.

**Manual snapshot** (before risky migrations/maintenance):

```bash
pg_dump "$DATABASE_URL" -Fc -f hezalli-$(date +%Y%m%d).dump   # backup
pg_restore --clean --no-owner -d "$DATABASE_URL" hezalli-YYYYMMDD.dump   # restore
```

Test-restore into a scratch database at least once per quarter so the process
is known-good before it is needed.

## Migrations

- Apply committed migrations in any environment: `npx prisma migrate deploy`.
- Author a new migration locally: edit `prisma/schema.prisma`, then
  `npm run db:migrate` (runs `prisma migrate dev`), then commit the generated
  `prisma/migrations/*` folder.
- Always take a manual snapshot before deploying a migration that drops or
  rewrites columns. Roll back by restoring the snapshot (Prisma migrations are
  forward-only).
- Regenerate the client after schema changes: `npm run db:generate`.

## Deploy & rollback

- CI (`.github/workflows/ci.yml`) gates every push: format, lint, typecheck,
  build, Vitest (unit + integration against Postgres), and Playwright E2E. A
  red pipeline blocks merge.
- Deploy = push to the production branch (host builds and promotes). Roll back
  by promoting the previous successful deployment in the host dashboard, then
  restoring the DB only if a migration must be reverted.
- Seed a fresh environment: `npx prisma migrate deploy && npm run db:seed`
  (dev/staging only — the seed clears data first).

## Performance

- **Indexes.** Hot query columns are indexed (`Product` on storeId/categoryId/
  status/brandId/isFeatured; `Order` on buyerId/status; `SubOrder` on
  orderId/storeId/status; ledger/payment/shipment/notification on their FKs).
  Add an index when a new hot filter/sort is introduced.
- **N+1.** Listing and order pages fetch relations with a single nested Prisma
  `select`/`include` — no per-row queries. Keep this pattern; inspect Prisma
  query logs (`DEBUG=prisma:query`) when adding data-heavy pages.
- **Full-text search** currently computes `to_tsvector` per query at catalog
  scale (see `lib/search.ts`). Swap in a dedicated search service
  (Meilisearch/Typesense) in Phase 17 when catalog size warrants it.
- **Lighthouse.** Target ≥85 performance & accessibility on home, a listing
  page, and a PDP. Measure against a production build:
  `npm run build && npm run start`, then
  `CHROME_PATH=<chromium> npx lighthouse http://localhost:3000/en --only-categories=performance,accessibility`.
  Product images already lazy-load inside fixed-aspect containers (no CLS);
  migrate covers to `next/image` once the production storage hostname is known
  and added to `next.config.ts` `images.remotePatterns`.
- **Error / loading UI.** Next's defaults are used deliberately: adding a
  `loading.tsx`/`error.tsx` boundary turns the segment into a streamed response,
  which flushes a `200` status before `notFound()` runs and downgrades real 404s
  (missing product/store/page) to soft-200s — bad for SEO. Custom **localized**
  error/loading pages are a follow-up that must preserve the 404 status (e.g. a
  middleware rewrite or a route handler that sets the status explicitly).

## Security operations

- Security headers (CSP, HSTS, frame/sniffing/referrer/permissions) are set for
  every route in `next.config.ts`. Findings and rationale: `docs/SECURITY.md`.
- **Rate limiting** (`lib/rate-limit.ts`) is in-process. On multiple instances
  or serverless, back it with a shared store (Upstash/Redis) so limits are
  authoritative across instances. Until then, prefer a single instance for the
  auth endpoints or accept per-instance limits.
- Rotate `AUTH_SECRET` on suspected compromise (invalidates all sessions).

## Common incident playbooks

- **Site down / 500s everywhere.** Check host status + recent deploy; roll back
  to the last green deployment. Check `DATABASE_URL` reachability.
- **DB connection exhaustion.** Ensure the pooled connection string is used in
  production; check for a runaway migration or backfill holding connections.
- **Payment/refund dispute.** The ledger is the source of truth
  (`LedgerEntry`); every admin money action is in `AuditLog`. Reconcile a
  seller balance with `recomputeBalance` (`lib/finance.ts`).
- **Abuse / spam accounts.** Suspend from `/admin/users` (blocks login) or a
  store from `/admin/sellers/[id]` (hides its products); both are audit-logged.
- **Maintenance window.** Toggle maintenance mode in `/admin/settings` — the
  storefront closes to everyone except admins.
