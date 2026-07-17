# 04 — Phase 4: Seller Onboarding & Stores

**Goal:** A buyer can open a store instantly (automatic approval — DECISIONS.md §7) and set up a public store; admin has post-moderation oversight.
**Prerequisite:** Phase 3 complete.

---

## Step 4.1 — "Become a seller" (instant store opening)

> ✏️ Rewritten to match **DECISIONS.md §7** (decided after this doc was first
> drafted): seller approval is **automatic** — no admin review gate. KYC is
> **not** required to list; it gates **payouts** (built in Phase 9, once file
> upload/storage exists for ID documents).

- "Sell on Hezalli" link in header + footer → `/sell` page: benefits pitch + form (store name, description, contact phone, seller-terms checkbox); signed-out visitors get a sign-in CTA that returns to `/sell`
- Submitting **immediately**: adds the **SELLER** role, creates `SellerProfile` (kycStatus `NONE`) + `SellerBalance` + an **ACTIVE** `Store` (unique auto-generated slug), refreshes the session, and lands on `/seller`
- A signed-in non-seller visiting `/seller/*` is redirected to `/sell` (invited to open a store) instead of a 403
- Admin oversight screen at `/admin/sellers` (post-moderation): list all stores with seller, KYC badge, product count, status; **Suspend / Reactivate** (with optional reason, written to `AuditLog`)

✅ **Acceptance criteria**
- [ ] A test buyer can open a store from `/sell` and immediately sees the `/seller` dashboard (no re-login needed)
- [ ] The seeded admin sees the new store at `/admin/sellers` and can suspend / reactivate it

> **🔜 NEXT-STEP CARD**
> - **Next step:** 4.2 — Store profile & settings
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/04-seller-onboarding.md.
> Step 4.1 is done. Do Step 4.2: store profile settings and the public
> store page, as described. Commit, push, then show me the Next-Step
> Card for 4.3.
> ```

---

## Step 4.2 — Store profile & public store page

- `/seller/settings`: edit store name, slug (URL), logo upload, banner upload, description, return policy text, shipping policy text, customer-service contact
- **Public store page** at `/store/[slug]`: banner, logo, name, rating placeholder, follower count placeholder, product grid (will fill in Phase 5), policies tab
- Store slug uniqueness + validation

✅ **Acceptance criteria**
- [ ] Seller can fully brand their store; public page renders nicely on mobile

> **🔜 NEXT-STEP CARD**
> - **Next step:** 4.3 — Seller dashboard home
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Low
> - **Session:** Same session
> - **New-session prompt (if needed):**
> ```
> I am building the Hezalli marketplace. Read docs/04-seller-onboarding.md.
> Steps 4.1–4.2 are done. Do Step 4.3: the seller dashboard home with
> placeholder stat cards, as described. Commit, push, then show me the
> Next-Step Card for Phase 5.
> ```

---

## Step 4.3 — Seller dashboard home

- `/seller` home: stat cards (Products, Orders today, Pending shipments, Revenue this month — real numbers where data exists, 0 otherwise), recent orders table placeholder, setup checklist ("Add your first product", "Complete store profile")
- Payout details form (bank account / IBAN) stored on SellerProfile — *used in Phase 9*

✅ **Acceptance criteria**
- [ ] Dashboard renders with live counts from the database
- [ ] Payout details save correctly

> **🔜 NEXT-STEP CARD — PHASE 4 COMPLETE 🎉**
> - **Next step:** Phase 5, Step 5.1 — Categories & brands admin
> - **Model:** Claude Sonnet 5
> - **Thinking level:** Medium
> - **Session:** NEW session (new phase)
> - **Paste this prompt:**
> ```
> I am building the Hezalli marketplace. Phases 1–4 are done (auth,
> sellers, stores working). Read docs/05-product-catalog.md and
> docs/DECISIONS.md, review the existing code briefly, then implement
> Step 5.1 exactly as described. Commit, push, then show me the
> Next-Step Card for 5.2.
> ```
