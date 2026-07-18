# Security audit & hardening (Phase 15.2)

This is the written findings list from the Step 15.2 audit, with the status of
each item. Audit scope: all server actions (`lib/actions/*`), API route
handlers (`app/api/*`), the auth/authorization layer, payment and money flows,
uploads, and rendering of user/CMS content.

## Findings & fixes

| # | Severity | Area | Finding | Status |
|---|----------|------|---------|--------|
| 1 | Medium | Headers | No HTTP security headers (no CSP, HSTS, framing, MIME-sniffing, referrer, permissions). | **Fixed** — `next.config.ts` now sets CSP, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` on every route. Verified with `curl -I` and the E2E suite (pages still hydrate under the CSP). |
| 2 | Medium | Rate limiting | No throttling on authentication or account creation — brute-force / abuse exposure. | **Fixed** — added `lib/rate-limit.ts` (fixed-window limiter) and applied it to `authenticate` (8 / IP / 5 min) and `registerUser` (5 / IP / 15 min), keyed by client IP. Unit-tested. See note on multi-instance deployments below. |
| 3 | Low | Uploads | Locally-served files (`/api/files`) set `Content-Type` but not `nosniff`. | **Fixed** — the global `X-Content-Type-Options: nosniff` header (#1) covers this route. |
| 4 | Low | XSS | CMS page bodies render via `dangerouslySetInnerHTML` at `/p/[slug]`. | **Accepted** — content is authored only through `saveCmsPage`, which requires an ADMIN (authoritative DB role check). This is a trusted-author surface; the CSP (#1) is a mitigating control. Revisit with server-side sanitisation if non-admin authoring is ever added. |

## Verified secure (no change required)

- **Authorization (the #1 marketplace risk).** `requireAdminId` / `requireSellerStore`
  (`lib/authz.ts`) resolve roles from the **database**, not the JWT, and reject
  suspended or soft-deleted users. Seller-owned mutations (`product`, `inventory`,
  `store`, `seller-order`, `shipment`, `payout`, merchandising) scope every write
  by the caller's `storeId` (e.g. `where: { id, storeId }`), so **seller A cannot
  edit seller B's resources**. Admin-only actions (`admin-oversight`, `settings`,
  `cms`, `moderation`, `setStoreStatus`, catalog) verify ADMIN against the DB.
- **Cross-user data access (IDOR).** The buyer order detail page scopes
  `where: { id, buyerId: session.user.id }`; chat threads verify the caller is the
  conversation's buyer or seller; reviews require a **COMPLETED** sub-order owned by
  the buyer that actually contains the product. Manually re-tested: buyer1 loading
  buyer2's order id returns **404 with no data leak**.
- **Payment integrity.** Order totals, line prices, discounts, shipping, and
  commission are all computed server-side from database values in `placeOrder`; the
  client only submits `variantId` + `quantity`. Negative/zero quantities are
  filtered. Flash stock and normal stock use atomic guarded `updateMany` decrements
  (regression-tested for concurrency).
- **Injection.** No raw string interpolation of user input into SQL. Full-text
  search uses `$queryRawUnsafe` **only** with a static expression plus a bound
  parameter (`$1`); everything else uses the Prisma query builder.
- **Uploads.** `/api/upload` is authenticated, enforces a MIME allowlist
  (jpeg/png/webp/gif — **no SVG/HTML**) and a 5 MB size cap. `/api/files` guards
  against path traversal (`..` + `startsWith(UPLOAD_DIR)`).
- **Open redirects.** The login `callbackUrl` is restricted to same-site relative
  paths.
- **Secrets & cookies.** No secrets are committed (`.env` is git-ignored; only
  `.env.example` is tracked). Auth.js issues HttpOnly, SameSite session cookies
  (Secure in production).

## Operational notes

- **Rate limiter storage.** `lib/rate-limit.ts` keeps state in-process. On a
  single instance it throttles brute force effectively; a multi-instance or
  serverless deployment MUST back it with a shared store (Redis / Upstash) to be
  authoritative. This is called out again in the deployment runbook.
- **CSP.** The policy allows `'unsafe-inline'` for scripts/styles because the App
  Router injects inline bootstrap. A future hardening pass can move to nonces.
