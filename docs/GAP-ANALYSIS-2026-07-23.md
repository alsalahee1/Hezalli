# Hezalli — Completeness Gap Analysis vs Big Marketplaces (2026-07-23)

Benchmark: **Shopee, Amazon, Lazada** feature sets, adapted to Hezalli's market
(Yemen: COD-heavy, HezalliPay wallet, own courier fleet + delivery points, ar/en).

**Method:** 8 parallel deep audits, one per domain, each against a fixed external
checklist of what the big players actually ship. Every item carries a verdict —
**DONE** (with file evidence), **PARTIAL** (exists but incomplete), or **MISSING**
(not built) — so any claim in this document can be verified by opening the cited file.

**⚠️ How to keep this honest (the guarantee protocol):**

1. This project is **never "complete."** The correct question is *"what is the
   current gap list and which items block launch?"* Any audit that ends with
   "we are done" without a MISSING list should be rejected.
2. A feature counts as DONE **only with file:line evidence**. "The model exists in
   the schema" is not DONE (see: OtpToken, ExchangeRate, ReturnItem.quantity —
   all scaffolded but unwired).
3. When new work lands, update the verdict here **in the same PR**. Future audits
   re-verify this table instead of re-inventing the checklist.
4. Previous audits are complementary, not replaced: `AUDIT-2026-07-20.md` covered
   *correctness of existing code* (money races, performance — largely fixed);
   `SECURITY.md` covers security. **This document covers what does not exist yet.**

---

## Executive verdict (honest version)

**What is genuinely strong** — the core transaction loop is real and unusually
deep for this stage: multi-seller checkout with atomic stock/escrow, COD custody
chain (courier ledger → remit → seller settlement) with cash-exposure controls,
delivery points with QR pickup, returns → disputes → arbitration with automatic
money movement, a ledger-first wallet with reconciliation, KYC tiers, velocity
limits, and passkey step-up. Most marketplaces at this size do not have this.

**What is NOT true:** "ready to go and same as the big players." Blockers exist in
three layers:

- **Broken/stubbed basics (P0):** password reset is a "Coming Soon" page; email
  sending is a no-op stub (no provider wired — so *no* order emails, *no*
  newsletter, *no* reset emails even if built); there is no SMS/OTP provider;
  the public store page **does not list the store's products** (placeholder);
  store logo/banner upload has no UI; payment proof references/tx-hashes have no
  uniqueness constraint (same receipt can be reused); checkout has no
  serviceability gate; checkout has zero e2e tests; error tracking is a console
  stub; 2 of 4 cron routes are unscheduled in `vercel.json`.
- **Engagement/growth layer (P1–P2):** no personalization, no Product Q&A, no
  typo-tolerant/Arabic-normalized search, no buy-again, no gamification, no
  seller ads/campaign self-service, no multi-currency display (hardcoded USD),
  no PWA for buyers, no help center/support tickets.
- **Trust & safety + ops automation (P1):** no seller performance scorecard or
  penalties, no pre-listing moderation or prohibited-item screening, no
  blacklists/fraud scoring, no impersonation for support, observability not wired.

Domain scores (checklist items DONE / PARTIAL / MISSING):

| Domain | DONE | PARTIAL | MISSING |
|---|---|---|---|
| 1. Catalog, search & discovery | 3 | 12 | 2 |
| 2. Cart, checkout & orders | 8 | 7 | 1 |
| 3. Payments, wallet & finance | 6 | 5 | 3 |
| 4. Shipping, delivery, returns, disputes | 8 | 6 | 0 |
| 5. Seller experience | ~14 sub-items | ~10 | ~11 |
| 6. Buyer account & engagement | ~14 sub-items | ~10 | ~18 |
| 7. Admin, ops, trust & safety | 4 | 10 | 1 |
| 8. Platform engineering | 2 | 12 | 2 |

---

## P0 — Launch blockers (broken promises, money/abuse risk, dead ends)

**Status update (2026-07-23, same-day remediation):** 12 of 13 P0 items are now
FIXED (verified: tsc clean, eslint 0 errors, 350/350 unit+integration tests,
production build, 13/13 Playwright e2e including the new checkout spec, all 42
migrations apply cleanly). P0-3 (SMS provider) remains open — it needs a
commercial gateway decision for Yemen and is tracked in P1.

| # | Gap | Status | Resolution |
|---|---|---|---|
| P0-1 | Password reset did not exist (`ComingSoon`) | ✅ FIXED | Full flow: `lib/actions/password-reset.ts` (hashed one-time tokens in `OtpToken`, 30-min TTL, rate-limited, no account-existence leak), `forgot-password` + `reset-password` pages, en/ar messages |
| P0-2 | Email sending was a stub | ✅ FIXED | `lib/email.ts` now sends via Resend HTTP API when `RESEND_API_KEY`+`EMAIL_FROM` are set (documented in `.env.production.example`); graceful logged no-op otherwise. **Action needed: create a Resend account + set the 2 env vars** |
| P0-3 | No SMS provider / phone OTP | ⏳ OPEN (→P1) | Needs a Yemen SMS gateway decision; `OtpToken` model is ready |
| P0-4 | Store page showed no products | ✅ FIXED | Real paginated product grid via the listing engine (`getListing` + `sellerSlug` pin) on `store/[slug]` |
| P0-5 | No store logo/banner upload | ✅ FIXED | Upload UI in seller settings (via `/api/upload`, own-storage URL validation); banner renders on the public store page |
| P0-6 | Payment receipt reuse not prevented | ✅ FIXED | Migration `20260723090000_payment_reference_reuse_guard`: case-insensitive unique indexes on `Payment`/`WalletTopUp` reference + usdtTxHash, de-dup of existing rows, `err_proofReused` handling in both submit actions |
| P0-7 | Order/seller notices bypassed `notify()` | ✅ FIXED | Buyer confirmation, seller new-order, seller cancel notice, and seller→buyer status updates all route through `notify()` (in-app + email + push per prefs) after the money tx commits |
| P0-8 | No serviceability gate at checkout | ✅ FIXED | New `require_zone_coverage` platform setting (admin toggle): uncovered governorates get a checkout warning and `placeOrder` refuses home delivery (`zoneNotCovered`); pickup stays allowed. Default off until zones are configured |
| P0-9 | Checkout had zero e2e tests | ✅ FIXED | `tests/e2e/checkout.spec.ts`: login → PDP → cart → COD checkout → success → order list, passing |
| P0-10 | Error tracking not wired | ✅ FIXED | `captureError` reports to Sentry via the envelope HTTP API when `SENTRY_DSN` is set (no SDK, fire-and-forget); console always. **Action needed: create a Sentry project + set `SENTRY_DSN`** |
| P0-11 | 2 of 4 cron routes unscheduled | ✅ FIXED | `vercel.json` now schedules points (6h) and marketing (12h) crons |
| P0-12 | Order-page review/dispute buttons were dead stubs | ✅ FIXED | "Rate products" section with the real `ReviewForm` per completed item; "Not received" jumps to the shipment card (refund request / seller chat); new `not_received` return reason feeds the existing returns→dispute machinery |
| P0-13 | Terms/Privacy hardcoded English | ✅ FIXED | `/terms`, `/privacy`, `/about` now redirect to the bilingual, admin-editable CMS pages (`/p/terms` etc.); register form links updated |

## P1 — Needed within weeks of launch (parity essentials + T&S/ops maturity)

**Buyer-facing:**
- Social/Google login and phone-OTP login; login 2FA; device/session management (auth is password-only: `auth.ts:25-52`)
- Email change (currently impossible) and verified phone change (`lib/actions/account.ts:50-55`)
- Buy again / reorder (nothing exists); cancel reasons (cancel takes no reason: `order.ts`)
- Search: typo tolerance (pg_trgm) + Arabic normalization (FTS uses `simple` config — no diacritic folding/ال-prefix handling: `lib/search.ts:28-58`); search history; trending
- Multi-currency display — YER/SAR scaffolding exists but `order.ts:366-368` hardcodes USD; no switcher, no FX admin
- Buyer PWA (manifest is driver-only: `public/driver.webmanifest`); offline-capable sw
- Help center/FAQ + support tickets (only order-scoped disputes exist)
- Per-channel notification preferences (email+push share one toggle: `lib/notif-prefs.ts`)
- Delivery ETA on product page; free-shipping progress bar in cart
- Partial returns (schema supports qty — `ReturnItem.quantity` schema:1477 — but flow always returns everything: `return.ts:107-112`); per-category return windows/non-returnable flags (single global `return_window_days`: `lib/settings.ts:11`)
- Late-delivery buyer alerts; dispute SLA timers (none: disputes can sit forever)

**Seller-facing:**
- Seller performance metrics + penalties (late-ship/cancel/return/response rates — nothing seller-scoped exists)
- Seller notifications via push/email/bot (infra exists, order events bypass it)
- Low-stock alerts to seller (`lowStockThreshold` drives nothing); OOS auto-delist; stock movement history
- Settlement statement / analytics exports (no CSV anywhere in seller center)
- Flash-sale/campaign self-registration (flash sales are admin-only: `flash.ts:24,55`)
- Batch shipping / pickup manifests; per-category structured attributes; per-variant images

**Trust & safety / admin:**
- Pre-listing moderation option + prohibited-keyword screening (publish goes straight to ACTIVE: `product.ts:142`)
- Blacklists (phone/device/IP/address — none exist), multi-account detection, order fraud rules
- Support impersonation; admin credential reset; per-user activity timeline
- Audit-log coverage for the unlogged admin actions (payment.confirm, refund, dispute.resolve, banner/category/brand CRUD)
- Granular RBAC (ADMIN is an all-or-nothing superset: `lib/authz.ts:23`)
- GDPR-style data export + hard-delete path (only soft-delete: `account.ts:123-142`)

**Engineering:**
- Wire a real ESP + SMS gateway (unblocks P0-2/3); async job queue for email/push (all inline today)
- Redis for rate limiting/cache (in-memory limiter breaks multi-instance: `lib/rate-limit.ts`)
- hreflang + canonical tags (zero exist despite bilingual routing); OG images
- Dependency scanning (no npm audit/Dependabot in CI); magic-byte upload validation (`api/upload/route.ts` trusts client MIME)
- Zod validation for the ~58/70 action files without it; CSP nonces (currently `unsafe-inline`)
- Structured logging + alerting; checkout e2e spec (P0-9)

## P2 — Big-player growth features (post-launch roadmap)

- Gamification: daily check-in, coins, spin/games, streaks (core Shopee retention engine — entirely absent)
- Personalized "For You" feed + recommendation engine (home is identical for every user, cached: `(shop)/page.tsx:42-48`)
- Product Q&A; product comparison; review helpful-votes, review coins, video reviews
- Seller ads console (sponsored products/CPC); bundle/add-on deals; tiered/wholesale pricing
- Livestream/video shopping; store feed/posts; followed-store activity feed
- Loyalty tiers + points expiry + birthday rewards; affiliate program; group-buy
- BNPL/installments; saved payment methods; gift cards/store credit; split tender
- Real PSP integration + webhooks/auto-capture; per-category commission tiers
- Real carrier API integration (rates/AWB/webhooks — Carrier is a manual registry: `lib/actions/carrier.ts`); weight-based shipping; multi-package shipments; exchange/replacement flow; prepaid return labels
- External search engine (Meilisearch) once catalog outgrows Postgres FTS
- BI dashboards (funnel/cohort/leaderboards); merchandising drag-drop builder; segmented broadcast campaigns
- Native mobile apps; external product analytics (GA4/PostHog)

---

## Domain scorecards (full detail)

### 1. Catalog, Search & Discovery

| Item | Verdict | Evidence / gap |
|---|---|---|
| Category tree + landing pages | PARTIAL | Tree + cycle guard (`schema:630-643`, `category.ts:39-51`); landing filters exact slug only — not descendant subtree (`lib/search.ts:66`); no per-category attribute schema |
| Brand pages/filtering | PARTIAL | Model + facet + FTS match; no public `/brand/[slug]` landing |
| Variants | PARTIAL | Multi-attribute JSON + per-variant price/stock (`schema:704-721`); **no per-variant images** |
| Product detail page | PARTIAL | Gallery/zoom, variant picker, stock, seller card, share; **no video, no delivery ETA, no lightbox** |
| Search quality | PARTIAL | FTS + GIN + ts_rank (`lib/search.ts:22-52`); autocomplete ILIKE; **no typo tolerance, no Arabic normalization, no history/trending** |
| Filters & sort | PARTIAL | 7 facets w/ live counts + 6 sorts; no free-shipping/location/attribute/on-sale filters |
| Recommendations | PARTIAL | Related, also-bought (`lib/recommendations.ts`), recently viewed; **no personalization** |
| Product Q&A | **MISSING** | No model/UI anywhere |
| Reviews on PDP | DONE | Distribution, images, sort, seller reply, verified badge, report (`product-reviews.tsx`) |
| Flash sales | DONE | Countdown, sold-progress, upcoming, PDP flash pricing (`flash-section.tsx`, `flash-sale/page.tsx`) |
| Home merchandising | PARTIAL | Banners w/ scheduling, tiles, strips; no discover feed, no personalization |
| SEO | PARTIAL | Meta/OG/JSON-LD/sitemap/robots; **no canonical, no hreflang**; sitemap product cap 5000 |
| Badges/condition | PARTIAL | NEW/USED, discount %, store verified; no mall/preferred-seller tiers |
| Sold/stock/wishlist counts | PARTIAL | PDP only; nothing on cards; no save counts |
| Product comparison | **MISSING** | Nothing |
| Listing pagination/perf | DONE | Windowed pagination, indexed count + page-of-ids (`lib/search.ts:230-256`) |
| Store pages | PARTIAL | Stats/follow/policies present; **product grid is a placeholder (P0-4)**; no store search/categories/vouchers |

### 2. Cart, Checkout & Orders (buyer)

| Item | Verdict | Evidence / gap |
|---|---|---|
| Guest cart + merge + persistence | DONE | `cart-provider.tsx:112-152`, `cart.ts:144-194` |
| Multi-seller split | DONE | `order.ts:121-142, 369-394` |
| Cart operations | PARTIAL | Qty/remove/save-later/checkboxes/change-alerts; no move-to-wishlist, no in-cart variant switch |
| Checkout composition | PARTIAL | Address/delivery/payment/summary/points; **single coupon only, coupon and points mutually exclusive** (`order.ts:231`) |
| Stock atomicity + flash price | DONE | `order.ts:311-333` |
| Order confirmation | PARTIAL | Page + in-app/push; **no email (P0-7)** |
| Order list/detail | DONE | Timeline, tracking, events, chat, PDF invoice (`invoice/[orderId]`) |
| Status lifecycle | DONE | Full enum + confirm-received + auto-complete (`completion.ts`) |
| Cancellation | PARTIAL | Per-sub-order, refund+restore; **no reasons, no time window** |
| Reorder/buy again | **MISSING** | Nothing |
| Delivery estimates | DONE | Checkout ETA + order est. window |
| Unpaid auto-expiry | DONE | 24h TTL, proof-aware (`payment.ts:255-320`) |
| Partial fulfillment | PARTIAL | Per-seller yes; within-seller no (`shipment.ts:54-100`) |
| Address book | PARTIAL | Multiple/default/**map pin (done)**; no home/work labels |
| Mobile checkout | DONE | Responsive + sticky summary |
| Price transparency | PARTIAL | Shipping shown + server re-quote; no COD-fee or VAT lines |

Also: buyer order-note/delivery-instructions field missing; free-shipping progress bar missing; review/dispute buttons on order page stubbed (P0-12).

### 3. Payments, Wallet & Finance

| Item | Verdict | Evidence / gap |
|---|---|---|
| Checkout payment methods | DONE | COD/wallet/bank/USDT/local-wallet end-to-end (`order.ts`, `payment.ts`); shared generic proof flow |
| Wallet | DONE | Top-up/withdraw/P2P/QR/bills (real Reloadly), KYC tiers, PIN+passkey, receipts, COD hold |
| Refunds | DONE/PARTIAL | Full+partial, cumulative cap under lock (`refunds.ts:96-120`); bank/USDT refunds manual out-of-band; no buyer refund-tracker UI |
| Seller finances | PARTIAL | Escrow-until-completion, pending/available, payouts, per-order fees; flat commission only, no statements/exports |
| Ledger integrity | DONE | Idempotency indexes, reconciliation + drift reports (`wallet-reconcile.ts`); no full journal export |
| COD lifecycle | DONE | Collect→remit (3 paths)→settle, exposure/aging, collateral (`cod-guard.ts:357`, `finance.ts:269-313`) |
| Multi-currency | **MISSING** | Scaffolded, unwired — `order.ts:366-368` hardcodes USD; no switcher/FX admin |
| Fraud/risk | PARTIAL | Velocity/caps/freeze; **no duplicate-receipt constraints (P0-6)**, no blacklists/scoring |
| PSP/webhooks | **MISSING** (by design) | Manual-proof only; Reloadly outbound is the only provider |
| Admin financial reports | DONE | Summary/CSV, wallet audit, COD exposure, KPIs |
| Invoicing/tax | PARTIAL | PDF invoice done; **zero VAT/tax handling** |
| Chargeback workflow | **MISSING** | Dispute is order-scoped only |
| Loyalty economics | PARTIAL | Earn/redeem/referral solid; no expiry/tiers/cash-out |
| Buyer payment security | PARTIAL | No card storage, step-up auth good; receipt reuse unprevented |

### 4. Shipping, Delivery, Returns & Disputes

| Item | Verdict | Evidence / gap |
|---|---|---|
| Zones & rates | DONE | Per-store+zone, freeOver, express (`lib/shipping.ts:131-199`); no weight-based pricing |
| Shipment lifecycle | DONE | Waybill/label/hub scans/public tracking + live courier map (`track/[tracking]`) |
| Delivery attempts | DONE | Attempts/max/reschedule/RTS (`courier.ts:327-456`, `redelivery.ts`) |
| Driver app | DONE- | Tasks/QR/COD ledger/earnings/rating; **no destination map or nav deep-link** |
| Delivery points | DONE | Checkout pickup, custody/capacity, commissions, QR pickup, payouts, line-haul (`point-core.ts`) |
| Express | DONE | Fees/ETA/slots (`delivery-slots.ts`) |
| 3rd-party carriers | PARTIAL | Manual registry + tracking URL; no API integration |
| SLA tracking | PARTIAL | Internal dueBy/overdue + sweep; no buyer late alerts, no compensation |
| Returns RMA | DONE/PARTIAL | Reasons/photos/window/auto-approve/refund+restock; buyer self-ships; **no partial returns UI** |
| Return policy engine | PARTIAL | Single global window; no per-category/non-returnable |
| Disputes | DONE/PARTIAL | Full thread + arbitration + auto money movement (`dispute.ts:114-225`); **no SLA timers** |
| Escrow/buyer protection | DONE | `finance.ts:16, 95-144`, confirm-received flow |
| Address/geo | PARTIAL | Leaflet pin + governorate mapping; **no serviceability gate (P0-8)** |
| Delivery notifications | DONE | In-app + push + Telegram/WhatsApp (`bot-notify.ts`) |

### 5. Seller Experience

DONE: registration, onboarding checklist, store policies/slug, product CRUD w/ variants + draft/publish + duplicate + bulk status, image mgmt, to-ship queue, ship + labels + packing slips, cancel/refund, returns handling, product discounts, seller vouchers + follower fan-out, analytics dashboard (KPIs/series/top products), per-order fee breakdown, payout UX, follow system, auto-reply chat, responsive dashboard.

PARTIAL: KYC (gates wallet only, not listing; ID docs only), CSV import (500 rows, single-variant drafts, no images), category attributes (free-form JSON), low-stock (column drives nothing), new-order alert (in-app only — P0-7), settlement statements (no export), chat attachments (images only), help (dev docs only).

MISSING: admin approval gate for new sellers (auto-ACTIVE — `seller.ts:35-38`), store logo/banner upload UI (P0-5), store decoration, stock history, OOS auto-delist, batch shipping, flash-sale self-registration, bundles/add-ons, ads console, performance scorecard/penalties, analytics exports, quick replies, staff sub-accounts, store feed.

### 6. Buyer Account & Engagement

DONE: email/password auth, profile/avatar, locale, wishlist + price-drop + restock alerts, store follow + voucher fan-out, reviews (gate/images/edit/reply/report), loyalty earn/redeem/history, referral (200pt), in-app notification center + web push, chat (inbox/unread/images), AI shopping assistant (Gemini) + Telegram/WhatsApp bots (read-only), recently viewed, newsletter signup.

PARTIAL: account lockout (IP-only), delete account (soft only), notification prefs (email+push joint), chat realtime (polling), bot notifications (delivery events only), empty states.

MISSING: **password reset (P0-1)**, phone OTP login, social login, 2FA, device management, email change, verified phone change, privacy settings, multiple wishlists, followed-store feed + new-product alerts, video/anon reviews, helpful votes, review incentives, loyalty tiers/expiry, gamification (check-in/coins/games), help center/FAQ/tickets/live agent, personalized recs, saved searches, buyer PWA manifest/offline, onboarding tour.

### 7. Admin, Ops, Trust & Safety

DONE: dispute arbitration w/ auto money movement, financial ops queues (payments/payouts/top-ups/withdrawals/wallet audit/COD exposure/refunds), platform settings (~45 keys + maintenance mode), health endpoint.

PARTIAL: RBAC (7 roles, no granular perms), audit log (major gaps in coverage; no IP/UA), seller mgmt (no scorecard), product moderation (post-only), user mgmt (no impersonation/timeline), review moderation (no chat/image moderation), CMS (no targeting/layout builder), analytics (tiles only), fraud (wallet-side only), security posture (zod 12/70 actions, client-MIME uploads, unsafe-inline CSP, in-process rate limiter), legal (EN-only terms/privacy, no data export), ops tooling (console-only errors), broadcast (newsletter only, unbatched).

MISSING: blacklists/denylists of any kind.

### 8. Platform Engineering

DONE: i18n (3032=3032 key parity, RTL, next-intl), CI gate (format/lint/typecheck/build/unit/integration/e2e).

PARTIAL: perf (computed sorts materialize matched set — `lib/search.ts:180-210`; no Redis; homepage-only caching; no pool sizing), Arabic search (simple config), SEO (no hreflang/canonical/OG images), a11y (no tooling), testing (**no checkout e2e**), observability (Sentry stub), reliability (no queue; 2 crons unscheduled), deployment (solid Docker/backups/runbook; no zero-downtime), scalability (in-memory rate limit/cache, SSE in-process), security engineering (no dep scanning, unsafe-inline CSP), realtime (notifications/chat poll), PWA (driver-only), mobile (responsive, no native), analytics (no external pipeline).

MISSING: **email + SMS providers (P0-2/3)**, async job queue.

---

## Recommended execution order

1. **Week 1 — dead ends & fraud vectors (P0):** wire ESP (Resend/SES) + build password reset; store page product grid; store logo/banner upload; unique constraints on payment references/tx-hashes; route order/seller notifications through `notify()`; enable the review/dispute buttons on the order page; schedule missing crons; wire Sentry; serviceability check at checkout; translate terms/privacy; checkout e2e spec.
2. **Weeks 2–4 (P1):** SMS/OTP + phone verification; buy-again + cancel reasons; partial returns; seller performance metrics + low-stock alerts + exports; pre-listing moderation + blacklist infrastructure; Arabic search normalization + pg_trgm; multi-currency display; per-channel notification prefs; buyer PWA; help center + tickets; hreflang/canonical; Redis; zod coverage; dependency scanning.
3. **Months 2+ (P2):** personalization/recs engine, Q&A, gamification, seller campaigns/ads, loyalty tiers, PSP + carrier APIs, BI dashboards, native apps.
