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

---

# Pre-launch security audit (2026-07)

Second full audit ahead of public launch. Scope: every server action and API
route (authorization/IDOR), the entire wallet/COD/payout/refund money subsystem
(races, double-spend, step-up), webhooks, cron, uploads/file-serving, PDF/SSRF,
injection, secrets, deploy, and dependencies. Findings below were fixed on this
pass; each is covered by typecheck, lint, and the unit + integration suites
(regression tests added for the delivery race, the double-refund guard, and the
PIN step-up).

## Findings & fixes

| # | Severity | Area | Finding | Status |
|---|----------|------|---------|--------|
| C1 | **Critical** | Deploy/Auth | First production deploy auto-seeded a live `admin@hezalli.com` with the repo-committed password `hezalli123` — the `migrate` container ran the demo seed because its `builder` stage never set `NODE_ENV=production`, so `seed.ts`'s prod guard didn't fire. Anyone could log in as admin via `/login`. | **Fixed** — `NODE_ENV=production` set on the `migrate` service (both compose files); `seed-if-empty.ts` now refuses the demo seed in production; added `scripts/create-admin.ts` for a safe first-admin bootstrap (strong-password enforced, refuses known defaults) + docs in `.env.production.example`. |
| C2 | **Critical** | Money/Delivery | `markSubOrderDelivered` checked `SHIPPED` **outside** the transaction and wrote the status **unconditionally inside** it, so two concurrent "delivered" submits both accrued courier/point earnings (and COD ledger rows) — one delivery could mint duplicate, withdrawable earnings. | **Fixed** — the transition is now an atomic `updateMany` claim on `status:"SHIPPED"` as the first statement in the tx (a loser sees `count 0` and bails before any ledger write). Added partial-unique indexes on `CourierLedgerEntry`/`DeliveryPointLedgerEntry` `(courier/point, subOrder)` per accrual type. Regression test simulates the concurrent submit. |
| H1 | **High** | Wallet/Auth | `setWalletPin` required the current PIN only when one already existed, so a passkey-only wallet (no PIN) could have a **first PIN enrolled from a bare session**, bypassing the passkey step-up. | **Fixed** — setting/replacing a PIN now requires a successful `verifyWalletAuth` (current PIN or passkey assertion) whenever the wallet already has any factor (existing PIN **or** a registered passkey). Routed through the lockout-aware path so the change endpoint can't brute-force the current PIN. Regression test added. |
| H2 | **High** | AI/Cost | `/api/ai-chat` was unauthenticated with no throttle; each call fans out to several paid Gemini requests → unbounded-cost DoS. | **Fixed** — per-IP burst limit + the shared global daily/spend cap now gate the route. |
| H3 | **High** | Webhooks | Telegram webhook **failed open** when `TELEGRAM_WEBHOOK_SECRET` was unset — anonymous POSTs were processed as genuine updates (impersonate a linked user, burn AI budget). | **Fixed** — fails closed: a configured bot must have the secret and every update must present it; secret added to `lib/env.ts` production validation. |
| H4 | **High** | Webhooks | WhatsApp signature verification returned `true` (accept) when `WHATSAPP_APP_SECRET` was unset. | **Fixed** — fails closed in production; secret added to production env validation. |
| M1 | Medium | Money/AML | Outflow velocity caps for **withdrawals and bill/airtime pay** used only the raceable pre-flight check; the row-locked in-tx guard was used only by P2P. | **Fixed** — `assertOutflowWithinLimitTx` now runs inside the withdrawal and bill transactions under the wallet row lock. |
| M2 | Medium | Money/Refund | `applyRefund` treated only `REFUNDED` as terminal; a buyer-cancelled wallet order (already refunded, no `Refund` row) could be refunded **again** by an admin. | **Fixed** — `CANCELLED` and an already-`REFUNDED` order payment are now terminal. Regression tests added. |
| M3 | Medium | Files/PII | `/api/files/[...path]` served everything publicly, incl. `kyc/` identity documents (regulated PII), cached `public`. | **Fixed** — `kyc/` requires the owner or wallet/admin staff; `proof/` requires authentication; both are `private, no-store`. (S3 driver: move KYC to a private bucket + signed URLs — see follow-ups.) |
| M4 | Medium | Export/CSV | Exports/statements didn't neutralize spreadsheet formula prefixes — a user-controlled field like a display name of `=HYPERLINK(...)` executes when staff open the CSV. | **Fixed** — shared `csvCell` (`lib/csv.ts`) prefixes cells starting with `= + - @`/control chars; all four exporters use it. |
| M5 | Medium | Tracking | Public tracking endpoints had no rate limit — tracking numbers (`HZE`+10 digits) were enumerable. | **Partly fixed** — per-IP rate limiting added to the location + SSE stream routes. Follow-up: longer/opaque tracking ids. |

## Verified secure this pass (no change required)

Authorization model (DB-checked roles, never the JWT; no role self-grant; all
actions/routes scope queries to the caller); server-recomputed checkout pricing
(no client-supplied amounts); parameterized SQL (both `$queryRawUnsafe` sites use
bound params); no SSRF (PDF URL is server-built and host-locked); upload MIME
allowlist blocks SVG/HTML; path-traversal defended; cron endpoints fail closed;
account-linking codes are ~72-bit + session-bound; AI assistant tools are
read-only and user-scoped; scrypt+salt+timing-safe passwords with atomic PIN
lockout; ledger row-locks + idempotency indexes on settlement/loyalty/cashback.

## Defense-in-depth hardening (done, follow-up pass)

All the follow-ups from the audit above are now implemented:

- **CSP nonces (done).** The CSP moved from `next.config.ts` to `middleware.ts`,
  which sets a fresh per-request script nonce and drops `'unsafe-inline'` for
  `script-src` (styles keep it). Verified with a production build + a headless
  Chromium smoke test: Next stamps the nonce on its scripts, pages render and
  hydrate with **zero CSP violations**.
- **Shared rate-limit store (done).** `lib/rate-limit.ts` gained `rateLimitAsync`,
  an opt-in Upstash-Redis-REST backend (set `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN`) with automatic in-memory fallback on missing config
  or backend error. The IP-keyed brute-force/enumeration surfaces (login,
  register, AI chat, tracking) use it; per-actor limits stay in-process.
- **Opaque tracking ids (done).** Minted waybills are now 14 random digits
  (~10^14) instead of 10, on top of the per-IP rate limiting.
- **Private KYC/proof (done).** Sensitive objects are always served through the
  authenticated `/api/files` proxy — for the s3 driver too, via a credentialed
  `getObject` — so the bucket can stay private for `kyc/`/`proof/` and no public
  URL is ever minted for them.
- **Dependencies (done).** `npm audit` is clean (`0 vulnerabilities`): `npm audit
  fix`, a Next patch bump (15.5.21), and `overrides` pinning `sharp`/`postcss` to
  patched versions.
- **Seller suspension (done).** `saveProduct`, inventory edits, store settings,
  payout-method + payout requests, and earnings→wallet transfers now go through
  `requireActiveSeller` (DB-checked `isSuspended`/`deletedAt`), closing the
  stale-JWT write window.
- **CMS sanitization (done).** `saveCmsPage` sanitizes the HTML body on write
  (`lib/sanitize.ts`, `sanitize-html` allowlist) — scripts, event handlers, and
  unsafe URL schemes are stripped before storage; unit-tested.
