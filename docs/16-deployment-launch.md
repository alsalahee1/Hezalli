# 16 — Phase 16: Deployment & Launch

**Goal:** Hezalli live on the internet, on your domain, with real payments and monitoring.
**Prerequisite:** Phase 15 complete.

---

## Step 16.1 — Production setup & first deploy

Claude guides you click-by-click:

- Buy/confirm the **domain**; production **PostgreSQL** (Neon/Supabase paid or free tier to start); production storage bucket; production Resend (verify your domain for email deliverability — SPF/DKIM records)
- Deploy to **Vercel**: connect the GitHub repo, set ALL environment variables (from `.env.example`), custom domain + automatic HTTPS
- Run production migrations; create the real admin account (strong password); **do not seed fake data in production** — add a `SEED_ALLOWED` guard
- Configure Vercel Cron for the scheduled jobs (order auto-complete, unpaid expiry, flash-sale boundaries)
- Smoke-test the golden path in production with the payment gateway still in TEST mode

✅ **Acceptance criteria**
- [ ] `https://yourdomain.com` works end-to-end (register → buy with test card → ship → receive)
- [ ] Emails arrive from your domain and don't land in spam

> **🔜 NEXT-STEP CARD**
> - **Next step:** 16.2 — Monitoring & error tracking
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace, now deployed to production in
> payment test mode. Read docs/16-deployment-launch.md. Do Step 16.2:
> monitoring and error tracking. Commit, push, then show me the
> Next-Step Card for 16.3.
> ```

---

## Step 16.2 — Monitoring & error tracking

- **Sentry** (free tier): client + server error tracking with alerts to your email
- Uptime monitoring (UptimeRobot or similar) on the home page and checkout API
- Vercel Analytics or Plausible for traffic basics
- Log the important business events (order placed/paid/refund) in a queryable way
- Add alerting notes + "what to do when the site is down" to docs/RUNBOOK.md

✅ **Acceptance criteria**
- [ ] A deliberately thrown test error appears in Sentry and emails you

> **🔜 NEXT-STEP CARD**
> - **Next step:** 16.3 — Go live checklist
> - **Model:** Claude Opus 4.8
> - **Thinking level:** High
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace (deployed, monitored, payments
> in test mode). Read docs/16-deployment-launch.md. Walk me through
> Step 16.3, the go-live checklist, one item at a time, and switch
> payments to live mode with me. Then show me the Next-Step Card
> for Phase 17.
> ```

---

## Step 16.3 — Go live 🧠

Final checklist, one item at a time:

- [ ] Payment gateway account fully verified for **live mode**; swap to live keys; **make one real small purchase yourself and refund it**
- [ ] COD enabled/disabled per your decision; shipping zones/fees reviewed with real courier prices
- [ ] Legal pages (Terms, Privacy, Returns) reviewed — *consider a local lawyer; e-commerce usually needs a business license in your country*
- [ ] Commission %, return window, payout minimum set to real values
- [ ] Delete/disable all test accounts and test products in production
- [ ] robots.txt + sitemap live (full SEO in Phase 17); favicon, social share (OG) images
- [ ] Onboard your first 2–3 **real sellers** manually and help them list products
- [ ] Announce 🎉

✅ **Acceptance criteria**
- [ ] A real customer can buy a real product with real money, and the seller gets paid

> **🔜 NEXT-STEP CARD — PHASE 16 COMPLETE 🎉 YOU ARE LIVE!**
> - **Next step:** Phase 17 — pick your first growth item
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session
> - **Paste this prompt:**
> ```
> Hezalli marketplace is LIVE in production. Read
> docs/17-post-launch-growth.md and help me choose which growth item to
> do first based on my current situation. Then implement it following
> the same step discipline: acceptance criteria, commit, push,
> Next-Step Card.
> ```
