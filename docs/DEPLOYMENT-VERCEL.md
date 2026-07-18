# Hezalli — Deployment & Launch guide (Phase 16)

End-to-end guide to put Hezalli live on Vercel with a hosted Postgres, an
S3-compatible bucket, scheduled jobs, monitoring, and a go-live checklist.

> Payments are **manual** (COD / wallet / bank transfer / USDT — see
> `docs/DECISIONS.md`); there is no card gateway to configure. Wherever the
> phase docs mention a "payment gateway test/live mode", that maps to enabling
> the manual methods and doing one real end-to-end order + refund yourself.

---

## 16.1 — Production setup & first deploy

### 1. Provision infrastructure

- **Domain** — buy/confirm your domain with any registrar.
- **PostgreSQL** — create a project on [Neon](https://neon.tech) or
  [Supabase](https://supabase.com). Copy the **pooled** connection string
  (append `?sslmode=require`). This is `DATABASE_URL`.
- **Storage bucket** — create an S3-compatible bucket (Cloudflare R2 shown in
  `.env.example`). Note endpoint, region, bucket, keys, and public URL. See
  `docs/STORAGE.md`.

### 2. Deploy to Vercel

1. Push the repo to GitHub (done). In Vercel: **Add New → Project → import the
   repo**. Framework preset auto-detects Next.js.
2. **Environment variables** — add every variable from `.env.example` with real
   values (Project → Settings → Environment Variables), for the Production
   environment:
   - `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_URL`
     (`https://yourdomain.com`), `NEXT_PUBLIC_APP_URL` (same),
     `STORAGE_DRIVER=s3` + the `S3_*` vars, and `CRON_SECRET`
     (`openssl rand -base64 32`).
   - The app **fails fast at boot** if `DATABASE_URL` or `AUTH_SECRET` is
     missing in production (see `lib/env.ts` / `instrumentation.ts`).
3. **Deploy.** Then add your **custom domain** (Settings → Domains); Vercel
   provisions HTTPS automatically. Set `AUTH_URL` / `NEXT_PUBLIC_APP_URL` to the
   final domain and redeploy.

### 3. Database migrations & the real admin

Migrations do **not** run automatically. From a machine with the production
`DATABASE_URL` exported (or a Vercel deploy hook / one-off job):

```bash
npx prisma migrate deploy
```

Do **not** run `npm run db:seed` in production — it wipes data and inserts fake
records. The seed refuses to run when `NODE_ENV=production` unless
`SEED_ALLOWED=true` is explicitly set.

Create the real admin account with a strong password (do this once, via a
one-off script or `prisma studio`), hashing with the app's helper:

```ts
import { hashPassword } from "./lib/password";
await prisma.user.create({
  data: {
    email: "you@yourdomain.com",
    name: "Owner",
    passwordHash: await hashPassword(process.env.ADMIN_PASSWORD!),
    roles: ["ADMIN", "BUYER"],
    locale: "ar",
  },
});
```

### 4. Scheduled jobs (Vercel Cron)

`vercel.json` registers an hourly cron on `/api/cron/auto-complete`, which
runs: auto-complete delivered orders, auto-approve stale returns, and expire
unpaid prepaid orders (restoring stock). Vercel Cron sends
`Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is set;
the endpoint returns 401 otherwise. (Flash-sale start/end need no job — live
queries are time-bounded. On the Hobby plan, cron runs at most daily; upgrade
for hourly.)

### 5. Smoke-test production

`https://yourdomain.com/api/health` should return `{"status":"ok","db":"up"}`.
Then walk the golden path: register → add to cart → COD checkout → (as seller)
process & ship → (as buyer) confirm receipt → request a return → (as admin)
refund. Confirm `/robots.txt` and `/sitemap.xml` resolve.

✅ **Acceptance:** the domain works end-to-end; email deliverability is verified
once Resend (or another provider) is wired via the notification adapter.

---

## 16.2 — Monitoring & error tracking

- **Error tracking (Sentry).** Every server error already flows through
  `instrumentation.ts` → `lib/observability.ts` (`captureError`). To enable
  Sentry: `npm i @sentry/nextjs`, add `SENTRY_DSN`, and forward the error in
  `captureError` (the plug-in point is marked in the file). Client errors: add
  the Sentry client config per their Next.js guide. **Verify** by throwing a
  test error and confirming it reaches Sentry + emails you.
- **Uptime.** Point [UptimeRobot](https://uptimerobot.com) (or similar) at
  `https://yourdomain.com/api/health` (5-minute interval; alert on non-200) and
  at the home page.
- **Analytics.** Enable Vercel Analytics (one toggle) or add Plausible.
- **Business events.** Admin money actions are already in `AuditLog`
  (`/admin/audit`); order lifecycle transitions are in `OrderStatusHistory`.
  Query these for order-placed/paid/refunded reporting.
- Alerting + "site is down" steps live in `docs/RUNBOOK.md`.

✅ **Acceptance:** a deliberately thrown error appears in Sentry and emails you.

---

## 16.3 — Go-live checklist

- [ ] Manual payment methods enabled and reviewed (`/admin/settings` → COD
      toggle); do one real small order + refund end-to-end yourself.
- [ ] Shipping zones/fees reviewed with real courier prices
      (`/admin/shipping-zones`, `/admin/carriers`).
- [ ] Legal pages (Terms, Privacy, Returns) reviewed by a local lawyer and
      edited at `/admin/pages` — the seeded copy is **draft only**. Confirm any
      business-license requirements for e-commerce in your country.
- [ ] Commission %, return window, auto-complete days, payout minimum set to
      real values (`/admin/settings`).
- [ ] Delete/disable all test accounts and test products
      (`/admin/users`, `/admin/products`).
- [ ] `robots.txt` + `sitemap.xml` live (served by `app/robots.ts` /
      `app/sitemap.ts`); favicon present; add Open-Graph/social share images.
- [ ] Onboard your first 2–3 real sellers manually; help them list products.
- [ ] Announce. 🎉

✅ **Acceptance:** a real customer buys a real product with real money and the
seller gets paid (tracked through the ledger; payout via `/admin/payouts`).
