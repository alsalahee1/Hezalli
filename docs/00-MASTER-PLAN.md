# 00 — MASTER PLAN: Building the Hezalli Marketplace

> **Read this file first, completely.** It explains what you are building, the rules for working with Claude Code, and how to move through the 17 phases.

---

## 1. What you are building

A **multi-vendor e-commerce marketplace** (like Shopee, Lazada, Noon, Amazon, eBay) with three kinds of users:

| User | What they can do |
|---|---|
| **Buyer** | Register, browse, search, filter, add to cart/wishlist, checkout, pay (card / COD), track shipment, confirm delivery received, review products, request returns, chat with sellers, use coupons |
| **Seller** | Register a store, get verified (KYC), list products with photos/variants/stock, manage prices, receive orders, ship orders, print labels, handle returns, chat with buyers, run discounts, see sales reports, receive payouts |
| **Admin** | Approve/suspend sellers, moderate products, manage categories, resolve disputes, manage coupons/flash sales, refund orders, see platform reports, configure commissions and shipping |

### Complete feature map (nothing missed)

This is every feature area the plan covers. Each maps to a phase document:

1. **Accounts**: buyer/seller registration, email + phone verification (OTP), login, logout, password reset, social login (Google), profile, multiple delivery addresses, account deletion — *Phase 3*
2. **Seller onboarding**: seller application, ID/business verification (KYC), store profile (name, logo, banner, policies), seller dashboard — *Phase 4*
3. **Catalog**: category tree, brands, products, variants (size/color), multiple images, stock/inventory, SKU, drafts, bulk upload — *Phase 5*
4. **Discovery**: home page, category pages, keyword search, filters (price, brand, rating, seller), sorting, product detail page, related products, recently viewed — *Phase 6*
5. **Cart & wishlist**: add/update/remove, multi-seller cart split, save for later, wishlist — *Phase 7*
6. **Checkout & orders**: address selection, shipping option selection, order summary, place order, order statuses (pending → confirmed → shipped → delivered → completed / cancelled), order history for buyer and seller, invoices — *Phase 8*
7. **Payments**: card payments via gateway, Cash on Delivery (COD), wallets (optional), refunds, platform commission, seller payouts/settlements — *Phase 9*
8. **Shipping & delivery**: shipping zones and fees, carrier integration or manual tracking numbers, shipment tracking page, delivery confirmation, **"order received" confirmation by buyer**, auto-complete after N days — *Phase 10*
9. **Post-order**: product reviews with photos, seller ratings, return/refund requests with reasons and evidence, dispute escalation to admin — *Phase 11*
10. **Communication**: buyer↔seller chat, order notifications (email, in-app, push), announcement banners — *Phase 12*
11. **Promotions**: coupon codes, seller vouchers, platform vouchers, flash sales with countdown, free-shipping promos — *Phase 13*
12. **Admin panel**: dashboards, user management, seller approval, product moderation, category/brand management, order oversight, dispute resolution, commission settings, CMS pages (About, Terms, Privacy) — *Phase 14*
13. **Quality**: automated tests, security hardening, rate limiting, performance, backups — *Phase 15*
14. **Launch**: hosting, domain, HTTPS, environment secrets, monitoring, error tracking — *Phase 16*
15. **Growth**: analytics, SEO, sitemap, multi-language (Arabic/English + RTL), mobile app, recommendations — *Phase 17*

---

## 2. Recommended technology stack

Chosen to be **beginner-friendly, cheap to start, and very well supported by Claude Code**. You can ask Claude to swap any piece in Phase 1.

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (React, App Router, TypeScript)** — one codebase for website + API | Most popular, huge ecosystem, deploys free on Vercel |
| Styling | **Tailwind CSS + shadcn/ui** | Fast, professional-looking UI |
| Database | **PostgreSQL** (hosted on Neon or Supabase — free tier) | The standard for e-commerce data |
| ORM | **Prisma** | Easy database access, migrations |
| Auth | **Auth.js (NextAuth v5)** | Email/password + Google login, sessions |
| File storage | **Cloudflare R2** or **Supabase Storage** (S3-compatible) | Product images |
| Payments | **Stripe** (worldwide) — or a regional gateway (Moyasar / Tap / PayTabs / HyperPay for Middle East) + **COD** | Decide in Phase 1 based on your country |
| Search | Postgres full-text first → **Meilisearch** later if needed | Start simple |
| Email | **Resend** | Verification emails, order emails |
| Cache / queues | **Redis (Upstash)** — added when needed | Sessions, rate limits, jobs |
| Realtime chat | **Pusher** or Supabase Realtime | Buyer-seller chat |
| Hosting | **Vercel** (app) + Neon/Supabase (DB) | Free to start, zero server admin |

---

## 3. How to work with Claude Code — Models, levels, sessions

### 3.1 Which model for which job

| Model | Use it for | Rough rule |
|---|---|---|
| **Claude Opus 4.8** (or the highest model available to you, e.g. Fable 5) | Architecture decisions, database schema design, payments, security, checkout logic, debugging hard bugs, code review | Anything where a mistake is expensive |
| **Claude Sonnet 5** | Normal feature building: pages, forms, APIs, dashboards — **this is your default workhorse** | 80% of all steps |
| **Claude Haiku 4.5** | Tiny tasks: change text, adjust colors, rename things, small CSS fixes | Anything you could almost do yourself |

> 💡 If your plan only includes one model, just use it for everything — the plan still works. The model column is an optimization, not a requirement.

### 3.2 Thinking level

Claude Code lets the model "think" more or less before acting (in Claude Code you can write "think hard" / "ultrathink" in your prompt, or set effort):

- **High** — design steps, database schema, payments, security, debugging
- **Medium** — normal feature implementation (default)
- **Low** — trivial edits and styling

### 3.3 Same session or new session?

**Rules:**

1. **New session at the start of every phase.** Fresh context = better focus.
2. **Same session for consecutive steps inside a phase**, unless the Next-Step Card says otherwise.
3. **Start a new session anytime the conversation gets very long** (Claude seems to forget things or gets slower). The docs are written so any new session can pick up exactly where you left off.
4. **Before ending ANY session**, always ask Claude: *"Commit and push all work with a clear message, and tell me exactly which step of which docs file I finished."* Your git history + these docs are your memory between sessions.
5. **Plan mode**: for big steps (marked 🧠 in the docs), start the step in **plan mode** (press Shift+Tab in Claude Code) so Claude proposes a plan before writing code.

### 3.4 The Next-Step Card

Every step in every phase document ends with a card like this:

> **🔜 NEXT-STEP CARD**
> - **Next step:** 5.3 — Product images upload
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **If you need a NEW session, paste this prompt:**
> ```
> I am building the Hezalli marketplace. Read docs/05-product-catalog.md.
> Steps 5.1 and 5.2 are already done and pushed. Review the existing code
> to understand the current state, then implement Step 5.3 exactly as
> described in the doc, including its acceptance criteria. When done,
> run the app to verify, then commit and push.
> ```

Just follow the cards from Phase 1 to Phase 17 and you will build the entire platform.

### 3.5 Golden rules (apply to every step)

1. **One step at a time.** Never ask Claude to do a whole phase in one prompt.
2. **Verify before moving on.** Every step has ✅ acceptance criteria — actually click through the app and check them.
3. **Commit + push after every step.** Small commits, clear messages.
4. **Never put secrets in code.** API keys go in `.env` (git-ignored); the docs remind you when this matters.
5. **If something breaks**, tell Claude the exact error message and what you clicked. Use a higher model + high thinking for stubborn bugs.
6. **Keep the docs updated.** If you change a decision (e.g., different payment gateway), ask Claude to update the affected docs file in the same commit.

---

## 4. Phase overview & timeline

Rough time assumes a few hours per day working with Claude Code.

| # | Phase | Doc | Depends on | Rough time |
|---|---|---|---|---|
| 1 | Planning & architecture | `01-planning-architecture.md` | — | 1–2 days |
| 2 | Project setup | `02-project-setup.md` | 1 | 1 day |
| 3 | Accounts & auth | `03-accounts-auth.md` | 2 | 2–4 days |
| 4 | Seller onboarding & stores | `04-seller-onboarding.md` | 3 | 2–3 days |
| 5 | Product catalog | `05-product-catalog.md` | 4 | 3–5 days |
| 6 | Search & discovery | `06-search-discovery.md` | 5 | 3–4 days |
| 7 | Cart & wishlist | `07-cart-wishlist.md` | 6 | 2 days |
| 8 | Checkout & orders | `08-checkout-orders.md` | 7 | 3–5 days |
| 9 | Payments | `09-payments.md` | 8 | 3–5 days |
| 10 | Shipping & delivery | `10-shipping-delivery.md` | 9 | 3–4 days |
| 11 | Reviews, returns & disputes | `11-reviews-returns-disputes.md` | 10 | 3–4 days |
| 12 | Chat & notifications | `12-chat-notifications.md` | 8 | 2–4 days |
| 13 | Promotions | `13-promotions.md` | 9 | 2–3 days |
| 14 | Admin panel | `14-admin-panel.md` | 3+ (grows with every phase) | 3–5 days |
| 15 | Testing, security, performance | `15-testing-security.md` | all core | 3–5 days |
| 16 | Deployment & launch | `16-deployment-launch.md` | 15 | 1–2 days |
| 17 | Post-launch & growth | `17-post-launch-growth.md` | 16 | ongoing |

**Total: roughly 6–10 weeks** to a real, launchable marketplace. An MVP (phases 1–10 with only COD payment) can be done in ~3–4 weeks.

---

## 5. Start here — your very first prompt

> **🔜 NEXT-STEP CARD (Step 0 → Phase 1)**
> - **Next step:** Phase 1, Step 1.1 — Product decisions interview
> - **Model:** Claude Opus 4.8 (or your best available model)
> - **Thinking level:** High
> - **Session:** NEW session
> - **Paste this prompt:**
> ```
> I am building "Hezalli", a multi-vendor e-commerce marketplace
> (like Shopee/Noon/Amazon). The full build plan is in the docs/ folder
> of this repo. Read docs/00-MASTER-PLAN.md and docs/01-planning-architecture.md,
> then start Step 1.1: interview me one question at a time about the
> product decisions listed in that step, and record my answers in
> docs/DECISIONS.md. When we finish the interview, commit and push,
> then show me the Next-Step Card for Step 1.2.
> ```
