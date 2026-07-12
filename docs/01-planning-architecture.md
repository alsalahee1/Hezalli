# 01 — Phase 1: Planning & Architecture

**Goal:** Make every important decision *before* writing code, and design the database that everything else builds on.
**Prerequisite:** You read `00-MASTER-PLAN.md`.
**Output of this phase:** `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md` — no application code yet.

---

## Step 1.1 — Product decisions interview 🧠

Have Claude interview you (one question at a time) and record every answer in `docs/DECISIONS.md`. Decisions to make:

1. **Country / region of launch** (affects payments, shipping, language)
2. **Languages**: English only? Arabic + English with RTL? (decide now — retrofitting RTL later is painful)
3. **Currency / currencies**
4. **Payment methods for launch**: card gateway (Stripe / Moyasar / Tap / PayTabs / HyperPay), COD, or COD-only MVP
5. **Who ships**: sellers ship themselves with tracking numbers (like eBay — *recommended for MVP*), or platform arranges couriers (like Shopee)
6. **Commission model**: % fee per sale the platform keeps (e.g. 5–10%)
7. **Seller approval**: automatic, or admin approves each seller (recommended: admin approves)
8. **Product approval**: listed instantly, or admin moderates first
9. **Categories at launch** (pick 5–15 top-level categories)
10. **Name/branding confirmed**: Hezalli? Domain name?
11. **MVP cut-line**: what launches first vs. later (suggested MVP = Phases 1–10 + minimal admin)

✅ **Acceptance criteria**
- [ ] `docs/DECISIONS.md` exists with a clear answer for all 11 points
- [ ] Committed and pushed

> **🔜 NEXT-STEP CARD**
> - **Next step:** 1.2 — System architecture document
> - **Model:** Claude Opus 4.8 (best available)
> - **Thinking level:** High
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/00-MASTER-PLAN.md,
> docs/01-planning-architecture.md and docs/DECISIONS.md. Step 1.1 is done.
> Do Step 1.2: write docs/ARCHITECTURE.md as described. Commit, push,
> then show me the Next-Step Card for 1.3.
> ```

---

## Step 1.2 — System architecture document 🧠

Claude writes `docs/ARCHITECTURE.md` covering:

- Final tech stack (start from the master plan's recommendation, adjusted by your DECISIONS answers)
- Folder structure of the Next.js app (routes for buyer site, `/seller` dashboard, `/admin` panel, API routes)
- How auth & roles work (BUYER / SELLER / ADMIN on one user account)
- Where images are stored, how payments flow (money in → commission → seller payout), how emails are sent
- A simple diagram (Mermaid) of the main components
- Environment variables list (`.env.example` content — names only, no secrets)

✅ **Acceptance criteria**
- [ ] `docs/ARCHITECTURE.md` exists, consistent with DECISIONS.md
- [ ] You read it and understood the big picture (ask Claude to explain anything unclear)
- [ ] Committed and pushed

> **🔜 NEXT-STEP CARD**
> - **Next step:** 1.3 — Database design
> - **Model:** Claude Opus 4.8 (best available) — *this is the most important design step of the whole project*
> - **Thinking level:** High (use plan mode)
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/01-planning-architecture.md,
> docs/DECISIONS.md and docs/ARCHITECTURE.md. Steps 1.1–1.2 are done.
> Do Step 1.3: design the full database schema in docs/DATABASE.md as
> described, covering every entity listed. Commit, push, then show me
> the Next-Step Card for Phase 2.
> ```

---

## Step 1.3 — Database design 🧠

Claude writes `docs/DATABASE.md`: every table/model, its fields, and relationships (as a Prisma-style schema draft + Mermaid ER diagram). It must cover **all** of these entities:

- `User` (roles: BUYER/SELLER/ADMIN), `Address`, verification tokens/OTP
- `SellerProfile` / `Store` (KYC status, policies, payout details)
- `Category` (tree), `Brand`, `Product`, `ProductVariant`, `ProductImage`, inventory fields
- `Cart`, `CartItem`, `Wishlist`
- `Order`, `OrderItem` (with price snapshot), `SubOrder` per seller (multi-seller orders split), order status history
- `Payment`, `Refund`, `Payout`/`SellerBalance`, commission fields
- `Shipment` (carrier, tracking number, status), shipping zones/rates
- `Review` (+ images), `ReturnRequest`, `Dispute`
- `Conversation`, `Message`; `Notification`
- `Coupon`/`Voucher`, `FlashSale`, `FlashSaleItem`
- `CmsPage`, `Banner`, admin audit log

Also document: order status flow (pending → paid/confirmed → processing → shipped → delivered → completed; + cancelled/refunded), and return status flow.

✅ **Acceptance criteria**
- [ ] `docs/DATABASE.md` covers every entity above with relationships
- [ ] Order/return status flows are written down
- [ ] Committed and pushed

> **🔜 NEXT-STEP CARD — PHASE 1 COMPLETE 🎉**
> - **Next step:** Phase 2, Step 2.1 — Scaffold the project
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phase 1 (planning) is done —
> read docs/00-MASTER-PLAN.md, docs/DECISIONS.md, docs/ARCHITECTURE.md,
> docs/DATABASE.md. Now open docs/02-project-setup.md and implement
> Step 2.1 exactly as described. Commit, push, then show me the
> Next-Step Card for 2.2.
> ```
