# 04 — Phase 4: Seller Onboarding & Stores

**Goal:** A buyer can apply to become a seller, get approved by admin, and set up a public store.
**Prerequisite:** Phase 3 complete.

---

## Step 4.1 — "Become a seller" application

- "Sell on Hezalli" link in header/footer → application form: store name, store description, category of goods, country/city, phone, ID document upload + (optional) business license upload (KYC)
- Submitting creates a `SellerProfile` with status **PENDING**
- Applicant sees an "application under review" page
- Basic admin approval screen at `/admin/sellers`: list pending applications, view documents, **Approve / Reject (with reason)** buttons
- On approve: user role becomes SELLER, store status ACTIVE, notification email sent
- On reject: email with reason; user may re-apply

✅ **Acceptance criteria**
- [ ] A test buyer can apply; the seeded admin can approve; the user then sees the `/seller` dashboard
- [ ] Rejected users see the reason and can re-apply

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
