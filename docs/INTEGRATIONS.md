# External Integrations & Plug-in Points

Hezalli is built to run end-to-end **without any third-party accounts**. Every
external service sits behind an internal adapter with a real, working default
(no-op / self-hosted / Postgres), so wiring a provider is an env change plus a
few lines at a marked plug-in point — never a refactor of the callers.

This is the single index of those seams and their status. It also records which
Phase 17 (post-launch growth) items are done versus deferred to an external
account or a separate project.

## External-service seams

| Capability | Default (no account) | Provider seam | Enable with |
|---|---|---|---|
| **Email** (transactional + newsletter) | No-op send; branded HTML is still rendered | `lib/email.ts` → `sendEmail()` (marked plug-in point); all sends funnel through `lib/notify.ts` | Install Resend/SES SDK, call it at the plug-in point; set `EMAIL_FROM` + provider key |
| **Object storage** (product images, uploads) | `local` driver writes under the app; served by `/api/files/[...path]` | `lib/storage.ts` (`STORAGE_DRIVER`) — provider-agnostic interface | `STORAGE_DRIVER=s3` + `S3_*` env vars (R2/Supabase/S3/MinIO). See `docs/STORAGE.md` |
| **Error monitoring** | `console.error` via `lib/observability.ts` | `captureError()` marked block | Install Sentry SDK, set `SENTRY_DSN` |
| **Full-text search** | Postgres FTS (`to_tsvector`/`plainto_tsquery`), facets + ranking in `lib/search.ts` | Callers depend only on `getListing()`; the text layer can be swapped | Meilisearch (typo-tolerance/instant) behind the same interface — see 17.3 below |
| **Scheduled jobs** | `/api/cron/*` routes, `CRON_SECRET`-guarded; the same work also runs lazily on page loads | `auto-complete` (orders/returns/payments), `marketing` (abandoned-cart) | Point any scheduler (Vercel Cron, etc.) at the routes with a `Bearer $CRON_SECRET` header |
| **Web funnel analytics** | Product views tracked in-DB (`Product.views`); seller sales analytics built in (`/seller/analytics`) | Add a script slot in the root layout | GA4 / Plausible — see 17.2 below |

## Phase 17 (Post-Launch & Growth) status

| Item | Status |
|---|---|
| 17.1 SEO | ✅ Built — metadata, JSON-LD (Product/Review/Breadcrumb), sitemap, robots |
| 17.2 Analytics | ✅ Seller analytics dashboard (traffic, conversion, top products, trends). ⏭️ GA4/Plausible funnels need an external account — script-slot seam documented above |
| 17.3 Better search | ⏭️ Postgres FTS is live and functional; Meilisearch is an external service. Callers already isolate the text layer (`lib/search.ts`) so it swaps without touching pages |
| 17.4 Recommendations | ✅ Built — co-purchase "customers also bought" + category affinity |
| 17.5 Multi-language | ✅ Built from Phase 1 — Arabic default + English, full RTL via next-intl |
| 17.6 Mobile app | ⏭️ Separate React Native/Expo project (its own codebase & release pipeline), reusing this app's API |
| 17.7 Seller tools | ✅ Built — CSV bulk import, chat auto-reply, vacation mode, sales analytics |
| 17.8 Marketing automations | ✅ Built — back-in-stock, price-drop, abandoned-cart reminders, newsletter (sending via the email seam) |
| 17.9 Loyalty | ✅ Built — points per purchase, redemption at checkout, referral program |
| 17.10 Scale-ups | ⏭️ Redis cache, read replicas, job queue, CDN tuning — infrastructure to add when traffic demands it |

**Legend:** ✅ built and tested against real Postgres + headless Chromium · ⏭️
deferred to an external account or a separate project, with the internal seam in
place.

Everything marked ⏭️ is a deliberate, documented boundary — not missing work.
The marketplace is feature-complete and runs today on its built-in defaults.
